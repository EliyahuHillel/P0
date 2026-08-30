/*
 * nodebb-plugin-gemach-directory
 *
 * מה זה עושה:
 * - שומר בשרת רשימת גמ"חים (שם, עיר, קטגוריה, איש קשר, תיאור), עם שני
 *   מצבים: "ממתין לאישור" ו-"מאושר". כל משתמש מחובר יכול "להציע" גמ"ח
 *   חדש (SocketPlugins.gemachDirectory.submit) - הוא נשמר כ"ממתין" ולא
 *   מוצג לאף אחד עד שמנהל מאשר אותו.
 * - כשמוצע גמ"ח חדש, נשלחת התראת NodeBB אמיתית (פעמון) לכל חברי קבוצת
 *   "administrators" - כדי שמנהל ידע שיש משהו ממתין לאישור.
 * - אישור/דחייה (SocketPlugins.gemachDirectory.approve/reject) פתוחים רק
 *   למנהלים (נבדק בשרת, לא רק בממשק) - אישור מעביר את הגמ"ח לרשימה
 *   הציבורית באופן מיידי, דחייה מוחקת אותו לגמרי (בלי לצבור "זבל").
 * - הרשימה הציבורית (SocketPlugins.gemachDirectory.listApproved) פתוחה
 *   לכולם, כולל גולשים לא-מחוברים.
 *
 * חלק הלקוח (הצגת הרשימה, הטופס להוספה, פאנל האישור למנהל) *לא* נמצא כאן -
 * הוא קובץ נפרד (gemach-directory-client.js) שמודבק ב-Custom JS של הפורום,
 * באותה שיטה שכבר עובדת בפורום הזה. כאן יש רק את חלק השרת: אחסון + לוגיקת
 * אישור - כי זה מה שדורש גישת שרת (SSH/npm install) ולא ניתן לעשות
 * מ-Custom JS בלבד.
 */
'use strict';

const db = require.main.require('./src/database');
const user = require.main.require('./src/user');
const groups = require.main.require('./src/groups');
const notifications = require.main.require('./src/notifications');
const SocketPlugins = require.main.require('./src/socket.io/plugins');

const COUNTER_OBJECT = 'gemachDirectory:counters';
const PENDING_SET = 'gemachDirectory:pending';
const APPROVED_SET = 'gemachDirectory:approved';
const GEMACH_KEY = id => `gemachDirectory:item:${id}`;

const MAX_LENGTHS = {
	name: 120,
	city: 60,
	category: 60,
	contact: 120,
	description: 500,
};

const plugin = {};

plugin.init = async function () {
	registerSocketHandlers();
	console.log('[nodebb-plugin-gemach-directory] נטען בהצלחה');
};

function registerSocketHandlers() {
	SocketPlugins.gemachDirectory = SocketPlugins.gemachDirectory || {};

	// כל משתמש מחובר יכול להציע גמ"ח - נשמר כ"ממתין" בלבד, לא מוצג לאף אחד
	// עד שמנהל מאשר. socket.uid מגיע מ-NodeBB עצמו, אי אפשר לזייף אותו.
	SocketPlugins.gemachDirectory.submit = async function (socket, data) {
		requireLogin(socket);

		const name = sanitizeText(data && data.name, MAX_LENGTHS.name);
		const city = sanitizeText(data && data.city, MAX_LENGTHS.city);
		const category = sanitizeText(data && data.category, MAX_LENGTHS.category);
		const contact = sanitizeText(data && data.contact, MAX_LENGTHS.contact);
		const description = sanitizeText(data && data.description, MAX_LENGTHS.description);

		if (!name || !city || !category || !contact) {
			throw new Error('[[error:invalid-data]]');
		}

		const id = await db.incrObjectField(COUNTER_OBJECT, 'nextId');
		const createdAt = Date.now();
		const gemach = {
			id,
			name,
			city,
			category,
			contact,
			description,
			status: 'pending',
			submittedBy: socket.uid,
			createdAt,
		};

		await db.setObject(GEMACH_KEY(id), gemach);
		await db.sortedSetAdd(PENDING_SET, createdAt, id);

		await notifyAdmins(gemach);

		return { ok: true };
	};

	// רשימת הגמ"חים המאושרים - פתוח לכולם, גם גולשים לא-מחוברים.
	SocketPlugins.gemachDirectory.listApproved = async function () {
		return getGemachsFromSet(APPROVED_SET, true);
	};

	// רשימת הגמ"חים הממתינים לאישור - מנהלים בלבד.
	SocketPlugins.gemachDirectory.listPending = async function (socket) {
		await requireAdmin(socket);
		return getGemachsFromSet(PENDING_SET, false);
	};

	// אישור גמ"ח - מנהלים בלבד. מעביר מיידית לרשימה הציבורית.
	SocketPlugins.gemachDirectory.approve = async function (socket, data) {
		await requireAdmin(socket);
		const id = data && data.id;
		if (!id) throw new Error('[[error:invalid-data]]');

		await db.sortedSetRemove(PENDING_SET, id);
		await db.sortedSetAdd(APPROVED_SET, Date.now(), id);
		await db.setObjectField(GEMACH_KEY(id), 'status', 'approved');

		return { ok: true };
	};

	// דחיית גמ"ח - מנהלים בלבד. מוחק לגמרי, בלי להשאיר "זבל".
	SocketPlugins.gemachDirectory.reject = async function (socket, data) {
		await requireAdmin(socket);
		const id = data && data.id;
		if (!id) throw new Error('[[error:invalid-data]]');

		await db.sortedSetRemove(PENDING_SET, id);
		await db.delete(GEMACH_KEY(id));

		return { ok: true };
	};
}

async function getGemachsFromSet(setKey, newestFirst) {
	const ids = newestFirst ?
		await db.getSortedSetRevRange(setKey, 0, -1) :
		await db.getSortedSetRange(setKey, 0, -1);
	if (!ids.length) return [];
	const gemachs = await db.getObjects(ids.map(GEMACH_KEY));
	return gemachs.filter(Boolean);
}

async function notifyAdmins(gemach) {
	const adminUids = await groups.getMembers('administrators', 0, -1);
	if (!adminUids || !adminUids.length) return;

	const notification = await notifications.create({
		type: 'gemach-directory-pending',
		// nid כולל את מזהה הגמ"ח - כך שכל הצעה חדשה היא התראה "חדשה" נפרדת
		nid: `gemach-directory:${gemach.id}`,
		bodyShort: `גמ"ח חדש ממתין לאישור: ${gemach.name} (${gemach.city})`,
		path: '/',
		from: gemach.submittedBy,
	});
	await notifications.push(notification, adminUids);
}

function requireLogin(socket) {
	if (!socket.uid) {
		throw new Error('[[error:not-logged-in]]');
	}
}

async function requireAdmin(socket) {
	requireLogin(socket);
	const isAdmin = await user.isAdministrator(socket.uid);
	if (!isAdmin) {
		throw new Error('[[error:no-privileges]]');
	}
}

// חיתוך אורך + הסרת תווי בקרה - הגנת שרת בסיסית. ההגנה האמיתית מפני
// XSS היא ב-escaping בצד הלקוח בזמן הצגה (ראו gemach-directory-client.js),
// כי הנתונים האלה מוזרקים שם ישירות ל-innerHTML.
function sanitizeText(value, maxLength) {
	if (!value || typeof value !== 'string') return '';
	// eslint-disable-next-line no-control-regex
	const stripped = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
	return stripped.slice(0, maxLength);
}

module.exports = plugin;
