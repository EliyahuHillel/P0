/*
 * nodebb-plugin-insurance-reminder
 *
 * מה זה עושה:
 * - שומר לכל משתמש (בשרת, לא בדפדפן) שני שדות: תאריך תחילת ביטוח ותאריך
 *   חידוש ביטוח. השמירה/קריאה נעשית דרך socket.io של NodeBB עצמו
 *   (SocketPlugins.insuranceReminder.*) - אין route/API חדש, אין CORS.
 * - כל יום ב-08:00 (בזמן השרת) בודק את כל המשתמשים, ולמי שנותרו 14 יום
 *   או פחות עד תאריך החידוש (כולל תאריך שכבר עבר) - שולח תזכורת לפי
 *   ההעדפה שהמשתמש בחר בכרטיסיית "ביטוח רכב" בעריכת הפרופיל: התראת
 *   NodeBB אמיתית (פעמון), מייל ישיר, שניהם, או כלום - ראו
 *   FIELD_NOTIFY_BELL/FIELD_NOTIFY_EMAIL למטה (ברירת מחדל: פעמון בלבד).
 * - לא שולח התראה כפולה על אותו תאריך חידוש - נשמר "עד איזה תאריך כבר
 *   הודעתי" (FIELD_LAST_NOTIFIED), ומתאפס אוטומטית כשהמשתמש משנה תאריך.
 *
 * חלק הלקוח (הצגת שדות בעמוד עריכת הפרופיל + באנר תזכורת) *לא* נמצא כאן -
 * הוא קובץ נפרד (insurance-reminder-client.js) שמודבק ב-Custom JS של
 * הפורום, באותה שיטה שכבר עובדת בפורום הזה עבור אשף "עזרה בקניית רכב".
 * כאן יש רק את חלק השרת: אחסון + לוגיקת תזכורת - כי זה מה שדורש
 * גישת שרת (SSH/npm install) ולא ניתן לעשות מ-Custom JS בלבד.
 */
'use strict';

const cron = require('node-cron');

// דרך הגישה הסטנדרטית של NodeBB למודולי הליבה מתוך פלאגין
const db = require.main.require('./src/database');
const user = require.main.require('./src/user');
const notifications = require.main.require('./src/notifications');
const emailer = require.main.require('./src/emailer');
const nconf = require.main.require('nconf');
const SocketPlugins = require.main.require('./src/socket.io/plugins');

const REMINDER_DAYS_BEFORE = 14;
const FIELD_DATE = 'insuranceDate';
const FIELD_RENEWAL = 'insuranceRenewalDate';
const FIELD_LAST_NOTIFIED = 'insuranceLastNotifiedRenewal';
// העדפות מסירה - נשלטות ע"י המשתמש עצמו מכרטיסיית "ביטוח רכב" בעריכת
// הפרופיל. ברירת מחדל (כשהשדה עוד לא קיים ב-DB, למשל למשתמשים שהגדירו
// תאריך לפני שהתווספה האפשרות): פעמון=כן, מייל=לא - כך שההתנהגות
// הקודמת (רק פעמון) לא משתנה למי שכבר הגדיר תאריך.
const FIELD_NOTIFY_BELL = 'insuranceNotifyBell';
const FIELD_NOTIFY_EMAIL = 'insuranceNotifyEmail';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const plugin = {};

plugin.init = async function () {
	registerSocketHandlers();
	cron.schedule('0 8 * * *', runDailyCheck);
	console.log('[nodebb-plugin-insurance-reminder] נטען בהצלחה, הבדיקה היומית תרוץ ב-08:00');
};

function registerSocketHandlers() {
	SocketPlugins.insuranceReminder = SocketPlugins.insuranceReminder || {};

	// שומר את שני התאריכים עבור המשתמש המחובר (socket.uid מגיע מ-NodeBB עצמו,
	// לא מהלקוח - אי אפשר לזייף uid של מישהו אחר).
	SocketPlugins.insuranceReminder.save = async function (socket, data) {
		requireLogin(socket);
		const insuranceDate = sanitizeDate(data && data.insuranceDate);
		const renewalDate = sanitizeDate(data && data.renewalDate);
		if (data && data.insuranceDate && !insuranceDate) {
			throw new Error('[[error:invalid-data]]');
		}
		if (data && data.renewalDate && !renewalDate) {
			throw new Error('[[error:invalid-data]]');
		}
		await db.setObject(`user:${socket.uid}`, {
			[FIELD_DATE]: insuranceDate || '',
			[FIELD_RENEWAL]: renewalDate || '',
			// איפוס "כבר הודעתי" - שינוי תאריך פותח מחדש את מחזור התזכורות
			[FIELD_LAST_NOTIFIED]: '',
			[FIELD_NOTIFY_BELL]: (data && data.notifyBell === false) ? '0' : '1',
			[FIELD_NOTIFY_EMAIL]: (data && data.notifyEmail === true) ? '1' : '0',
		});
		return { ok: true };
	};

	SocketPlugins.insuranceReminder.get = async function (socket) {
		requireLogin(socket);
		const data = await db.getObjectFields(
			`user:${socket.uid}`,
			[FIELD_DATE, FIELD_RENEWAL, FIELD_NOTIFY_BELL, FIELD_NOTIFY_EMAIL]
		);
		return {
			insuranceDate: data[FIELD_DATE] || '',
			renewalDate: data[FIELD_RENEWAL] || '',
			notifyBell: data[FIELD_NOTIFY_BELL] !== '0',
			notifyEmail: data[FIELD_NOTIFY_EMAIL] === '1',
		};
	};

	// גרסה קלה שמחזירה רק "כמה ימים נשארו" - לשימוש הבאנר בכל עמוד,
	// בלי לחשוף את התאריך המלא אם לא צריך.
	SocketPlugins.insuranceReminder.status = async function (socket) {
		if (!socket.uid) {
			return { daysLeft: null };
		}
		const data = await db.getObjectFields(`user:${socket.uid}`, [FIELD_RENEWAL]);
		const renewal = data[FIELD_RENEWAL];
		if (!renewal) {
			return { daysLeft: null };
		}
		return { daysLeft: daysUntil(renewal), renewalDate: renewal };
	};

	// כלי בדיקה למנהלים בלבד - מריץ עכשיו את הבדיקה היומית (בלי לחכות ל-08:00),
	// ומחזיר כמה משתמשים נבדקו ולכמה נשלחה התראה. לשימוש חד-פעמי בבדיקה אחרי
	// ההתקנה - ראו README.md, סעיף "בדיקה".
	SocketPlugins.insuranceReminder.testRun = async function (socket) {
		requireLogin(socket);
		const isAdmin = await user.isAdministrator(socket.uid);
		if (!isAdmin) {
			throw new Error('[[error:no-privileges]]');
		}
		return runDailyCheck();
	};
}

function requireLogin(socket) {
	if (!socket.uid) {
		throw new Error('[[error:not-logged-in]]');
	}
}

function sanitizeDate(value) {
	if (!value || typeof value !== 'string') return '';
	return DATE_RE.test(value) ? value : '';
}

function daysUntil(dateStr) {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const target = new Date(`${dateStr}T00:00:00`);
	return Math.round((target - today) / 86400000);
}

async function runDailyCheck() {
	const result = { checked: 0, notified: 0 };
	try {
		// כל ה-uid-ים בפורום, לפי הסט הסטנדרטי של NodeBB למיון משתמשים לפי תאריך הצטרפות
		const uids = await db.getSortedSetRange('users:joindate', 0, -1);
		for (const uid of uids) {
			// אחד אחד ולא Promise.all - כדי לא להעמיס על ה-DB בבת אחת בפורומים גדולים
			result.checked += 1;
			// eslint-disable-next-line no-await-in-loop
			const notified = await checkUser(uid);
			if (notified) result.notified += 1;
		}
	} catch (err) {
		console.error('[nodebb-plugin-insurance-reminder] הבדיקה היומית נכשלה', err);
	}
	return result;
}

async function checkUser(uid) {
	const data = await db.getObjectFields(`user:${uid}`, [FIELD_RENEWAL, FIELD_LAST_NOTIFIED]);
	const renewal = data[FIELD_RENEWAL];
	if (!renewal) return false;

	const daysLeft = daysUntil(renewal);
	const alreadyNotifiedForThisDate = data[FIELD_LAST_NOTIFIED] === renewal;

	if (daysLeft <= REMINDER_DAYS_BEFORE && !alreadyNotifiedForThisDate) {
		await sendReminder(uid, renewal, daysLeft);
		await db.setObjectField(`user:${uid}`, FIELD_LAST_NOTIFIED, renewal);
		return true;
	}
	return false;
}

async function sendReminder(uid, renewalDate, daysLeft) {
	const [userslug, prefs] = await Promise.all([
		user.getUserField(uid, 'userslug'),
		db.getObjectFields(`user:${uid}`, [FIELD_NOTIFY_BELL, FIELD_NOTIFY_EMAIL]),
	]);
	// ברירת מחדל: פעמון כן, מייל לא (ראו הערה ליד ההגדרות של השדות למעלה)
	const notifyBell = prefs[FIELD_NOTIFY_BELL] !== '0';
	const notifyEmail = prefs[FIELD_NOTIFY_EMAIL] === '1';
	if (!notifyBell && !notifyEmail) return;

	const bodyShort = daysLeft < 0
		? 'תוקף ביטוח הרכב שלך פג - חדשו בהקדם האפשרי'
		: daysLeft === 0
			? 'ביטוח הרכב שלך פג היום - חדשו עכשיו'
			: `נותרו ${daysLeft} ימים לחידוש ביטוח הרכב שלך`;
	const path = userslug ? `/user/${userslug}/edit` : '/';

	const notification = await notifications.create({
		type: 'insurance-reminder',
		// nid כולל את תאריך החידוש - כך שאם המשתמש משנה תאריך, זו התראה "חדשה"
		nid: `insurance-reminder:${uid}:${renewalDate}`,
		bodyShort,
		path,
		from: uid,
	});

	if (notifyBell) {
		await notifications.push(notification, [uid]);
	}

	// שולחים מייל ישירות (בלי תלות בהגדרות ה"התראות" הכלליות של NodeBB,
	// כי insurance-reminder הוא סוג התראה מותאם אישית שלא רשום שם) - רק
	// אם המשתמש סימן את תיבת "גם במייל" בכרטיסיית עריכת הפרופיל.
	if (notifyEmail) {
		try {
			await emailer.send('notification', uid, {
				path: notification.path,
				notification_url: nconf.get('url') + notification.path,
				subject: bodyShort,
				intro: bodyShort,
				body: '',
				notification,
				showUnsubscribe: false,
			});
		} catch (err) {
			console.error('[nodebb-plugin-insurance-reminder] שליחת מייל תזכורת נכשלה', err);
		}
	}
}

module.exports = plugin;
