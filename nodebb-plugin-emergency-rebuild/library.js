/*
 * nodebb-plugin-emergency-rebuild
 *
 * מה זה עושה:
 * מוסיף כתובת "גולמית" נסתרת (לא מוצג בשום תפריט, בשום כפתור, בשום עמוד) -
 * לדוגמה https://האתר-שלכם/emergency-rebuild?key=המפתח-הסודי-שלכם - שכשנכנסים
 * אליה מריצה ישירות `./nodebb build` ואז `./nodebb restart` בשרת, ומחזירה
 * תשובה כטקסט פשוט (לא עמוד HTML של הפורום).
 *
 * למה זה שימושי: אם קורה שוב מה שקרה פעם - "Failed to lookup view" (העמודים
 * לא מצליחים "להצטייר" כי קובצי העיצוב המהודרים נפגמו) - אי אפשר להשתמש
 * בכפתור "בניה מחדש" הרגיל ב-ACP, כי גם ה-ACP עצמו מציג עמודים ולכן קורס
 * באותה שגיאה בדיוק. הכתובת הזו **לא** משתמשת בשום מנגנון "ציור עמודים" של
 * NodeBB - היא קוד גולמי שרץ ישירות ועונה בטקסט רגיל, ולכן ממשיכה לעבוד גם
 * כשכל שאר האתר (כולל ה-ACP) מציג שגיאת 500.
 *
 * מגבלה חשובה שחובה להבין: זה עוזר רק כשתהליך NodeBB עצמו **חי ורץ**, פשוט
 * נכשל בציור עמודים (בדיוק המקרה שקרה). אם התהליך של NodeBB עצמו קורס/נהרג
 * לגמרי (לא רק שגיאת עמוד, אלא שהשרת "מת") - שום פלאגין לא יכול לעזור, כי
 * קוד של פלאגין רץ *בתוך* אותו תהליך בדיוק. למקרה כזה צריך מנגנון "שומר"
 * נפרד ברמת השרת עצמו (למשל pm2/systemd) - וזה דורש גישה אמיתית לשרת
 * להגדיר, לא ניתן לבנות את זה כפלאגין.
 *
 * הגדרה חד-פעמית (כשהאתר בריא ותקין):
 * 1. מתחברים לפורום כמנהל.
 * 2. פותחים קונסולת מפתחים בדפדפן (F12 -> Console) בכל עמוד בפורום.
 * 3. מדביקים ומריצים:
 *      socket.emit('plugins.emergencyRebuild.getMyKey', {}, console.log)
 * 4. מודפסת תשובה עם מפתח סודי אקראי (למשל
 *    {key: "a1b2c3...", url: "/emergency-rebuild"}). שומרים את זה במקום
 *    בטוח ונגיש (הערה בטלפון, מייל לעצמכם) - **לא** משתפים עם אף אחד.
 * 5. הכתובת המלאה לשעת חירום תהיה:
 *      https://הדומיין-שלכם/emergency-rebuild?key=המפתח-שקיבלתם
 *    שומרים אותה (Bookmark) בטלפון, כדי שתהיה נגישה גם אם האתר קורס.
 *
 * שימוש בשעת חירום: פשוט נכנסים לכתובת השמורה מכל דפדפן (גם בלי להיות
 * מחוברים בכלל לפורום - זה בכוונה, כדי שזה יעבוד גם אם משהו בהתחברות עצמה
 * שבור). מחכים כדקה-שתיים לתשובה בעמוד (בנייה מלאה לוקחת זמן), ואז מרעננים
 * את האתר הרגיל.
 *
 * אם חושדים שהמפתח דלף: מריצים socket.emit('plugins.emergencyRebuild.regenerateKey', {}, console.log)
 * כדי לקבל מפתח חדש (הישן מפסיק לעבוד מיד).
 */
'use strict';

const crypto = require('crypto');
const path = require('path');
const { exec } = require('child_process');

const db = require.main.require('./src/database');
const user = require.main.require('./src/user');
const SocketPlugins = require.main.require('./src/socket.io/plugins');

const SETTINGS_KEY = 'plugin:emergencyRebuild';
const ROUTE_PATH = '/emergency-rebuild';
// תיקיית השורש של ההתקנה של NodeBB - הפלאגין יושב תמיד ב-
// <שורש-NodeBB>/node_modules/nodebb-plugin-emergency-rebuild, אז שתי
// תיקיות למעלה מכאן זו תיקיית השורש שבה נמצא הקובץ nodebb הניתן להרצה.
const NODEBB_ROOT = path.join(__dirname, '..', '..');

const plugin = {};

plugin.init = async function (params) {
	registerSocketHandlers();
	registerEmergencyRoute(params.router);
	console.log('[nodebb-plugin-emergency-rebuild] נטען בהצלחה (נתיב נסתר - אין תפריט/כפתור בכוונה)');
};

function registerEmergencyRoute(router) {
	// שימו לב: לא משתמשים כאן ב-res.render בשום מקום - זה בדיוק העניין.
	// תשובה בטקסט רגיל בלבד, כדי לא להיות תלויים במנגנון התבניות השבור.
	router.get(ROUTE_PATH, async (req, res) => {
		res.set('Content-Type', 'text/plain; charset=utf-8');

		const providedKey = typeof req.query.key === 'string' ? req.query.key : '';
		let savedKey;
		try {
			savedKey = await db.getObjectField(SETTINGS_KEY, 'secret');
		} catch (err) {
			// גם אם ה-DB לא זמין מסיבה כלשהי - לא חושפים פרטים, סתם 404.
			res.status(404).send('Not found');
			return;
		}

		if (!savedKey || !providedKey || providedKey !== savedKey) {
			// בכוונה 404 גנרי (לא 403) - כדי לא לרמז לאף אחד שהכתובת הזו
			// בכלל קיימת/עושה משהו, גם למי שמנחש אותה בלי מפתח נכון.
			res.status(404).send('Not found');
			return;
		}

		runShellCommand('./nodebb build', { timeout: 10 * 60 * 1000 }, (buildErr, buildOut) => {
			if (buildErr) {
				res.status(500).send('הבנייה נכשלה:\n\n' + buildOut);
				return;
			}

			res.status(200).send(
				'הבנייה הסתיימה בהצלחה!\n' +
				'השרת מופעל מחדש עכשיו - חכו כ-15-30 שניות ואז רעננו את האתר הרגיל.'
			);

			// מפעילים מחדש רק *אחרי* ששלחנו תשובה - כי restart עלול לסגור
			// את התהליך הנוכחי (כולל הבקשה הזו עצמה) באמצע, לפני שהיינו
			// מספיקים לענות למי שמחכה מולו.
			setTimeout(() => {
				runShellCommand('./nodebb restart', { timeout: 60 * 1000 }, () => {});
			}, 500);
		});
	});
}

function runShellCommand(command, options, callback) {
	exec(command, { cwd: NODEBB_ROOT, timeout: options.timeout }, (err, stdout, stderr) => {
		callback(err, [stdout, stderr].filter(Boolean).join('\n'));
	});
}

function registerSocketHandlers() {
	SocketPlugins.emergencyRebuild = SocketPlugins.emergencyRebuild || {};

	// רק מנהל יכול לבקש/לראות את המפתח - שקוף לחלוטין לכל אחד אחר, ולא
	// חשוף בשום עמוד/כפתור. אם עוד אין מפתח - נוצר אחד אקראי בפעם הראשונה.
	SocketPlugins.emergencyRebuild.getMyKey = async function (socket) {
		await requireAdmin(socket);
		let key = await db.getObjectField(SETTINGS_KEY, 'secret');
		if (!key) {
			key = generateKey();
			await db.setObjectField(SETTINGS_KEY, 'secret', key);
		}
		return { key, url: ROUTE_PATH };
	};

	// יצירת מפתח חדש (מבטל את הישן באופן מיידי) - לשימוש אם חוששים שהמפתח
	// הקודם דלף למישהו.
	SocketPlugins.emergencyRebuild.regenerateKey = async function (socket) {
		await requireAdmin(socket);
		const key = generateKey();
		await db.setObjectField(SETTINGS_KEY, 'secret', key);
		return { key, url: ROUTE_PATH };
	};
}

async function requireAdmin(socket) {
	if (!socket.uid) {
		throw new Error('[[error:not-logged-in]]');
	}
	const isAdmin = await user.isAdministrator(socket.uid);
	if (!isAdmin) {
		throw new Error('[[error:no-privileges]]');
	}
}

function generateKey() {
	return crypto.randomBytes(24).toString('hex');
}

module.exports = plugin;
