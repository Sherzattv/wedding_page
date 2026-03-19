/**
 * RSVP webhook for Google Apps Script.
 * Один файл без Script Properties.
 */

var CONFIG = {
  SPREADSHEET_ID: "1bzIP8Yxvpy8tbadqV5QXCZ7ltDWzLG2o0qnTPbpxGzY",
  SHEET_NAME: "RSVP",
  TELEGRAM_BOT_TOKEN: "8492436207:AAGeyJ5LP_HQwmDyvTt2TMy2R_LoSDGQ7nE",
  TELEGRAM_CHAT_ID: "-5115133023"
};

function doGet() {
  return jsonResponse_({
    ok: true,
    service: "wedding-rsvp-webhook"
  });
}

function doPost(e) {
  try {
    var payload = parsePayload_(e);
    validatePayload_(payload);

    var rowNumber = appendToSheet_(payload);
    var telegramStatus = notifyTelegramSafe_(payload);

    return jsonResponse_({
      ok: true,
      row: rowNumber,
      telegram: telegramStatus
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function parsePayload_(e) {
  var raw = "";
  if (e && e.postData && e.postData.contents) {
    raw = String(e.postData.contents);
  }

  if (!raw) {
    throw new Error("Empty request body");
  }

  var parsed = JSON.parse(raw);

  return {
    attendance: normalizeAttendance_(parsed.attendance),
    name: normalizeText_(parsed.name),
    city: normalizeText_(parsed.city),
    children: normalizeChildren_(parsed.children),
    program: normalizeText_(parsed.program),
    submittedAt: normalizeText_(parsed.submittedAt),
    source: normalizeText_(parsed.source),
    userAgent: normalizeText_(parsed.userAgent)
  };
}

function validatePayload_(payload) {
  if (payload.attendance !== "yes" && payload.attendance !== "no") {
    throw new Error("Field 'attendance' must be 'yes' or 'no'");
  }
  if (!payload.name) {
    throw new Error("Field 'name' is required");
  }
  if (payload.children < 0) {
    throw new Error("Field 'children' must be >= 0");
  }
}

function appendToSheet_(payload) {
  if (!CONFIG.SPREADSHEET_ID) {
    throw new Error("Missing CONFIG.SPREADSHEET_ID");
  }

  var spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }

  var headers = [
    "created_at",
    "attendance",
    "name",
    "city",
    "children_count",
    "program_participation",
    "submitted_at_client",
    "source_url",
    "user_agent"
  ];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    var firstCell = String(sheet.getRange(1, 1).getValue() || "").trim().toLowerCase();
    if (firstCell === "created_at") {
      var existingHeader = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      var needsHeaderUpdate = headers.some(function(header, index) {
        return String(existingHeader[index] || "").trim() !== header;
      });
      if (needsHeaderUpdate) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }
    }
  }

  sheet.appendRow([
    new Date(),
    attendanceLabel_(payload.attendance),
    payload.name,
    payload.city,
    payload.children,
    payload.program,
    payload.submittedAt,
    payload.source,
    payload.userAgent
  ]);

  return sheet.getLastRow();
}

function notifyTelegramSafe_(payload) {
  try {
    notifyTelegram_(payload);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  }
}

function notifyTelegram_(payload) {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
    throw new Error("Missing Telegram config");
  }

  var isComing = payload.attendance === "yes";
  var text = "🎉 <b>Новый ответ от гостя!</b>\n\n" +
             "👤 <b>Имя:</b> " + payload.name + "\n" +
             "❓ <b>Решение:</b> " + (isComing ? "✅ Буду с радостью" : "❌ Увы, не смогу прийти");

  if (isComing) {
    text += "\n🏙 <b>Город:</b> " + (payload.city || "Не указан");
    text += "\n👶 <b>Дети:</b> " + payload.children;
    text += "\n🎤 <b>Участие в программе:</b> " + (payload.program || "—");
  }

  var url = "https://api.telegram.org/bot" + CONFIG.TELEGRAM_BOT_TOKEN + "/sendMessage";
  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id: CONFIG.TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: "HTML"
    })
  });

  if (response.getResponseCode() >= 300) {
    throw new Error("Telegram API error: " + response.getContentText());
  }
}

function normalizeText_(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeAttendance_(value) {
  var normalized = normalizeText_(value).toLowerCase();
  if (normalized !== "yes" && normalized !== "no") return "";
  return normalized;
}

function normalizeChildren_(value) {
  if (value === null || value === undefined || value === "") return 0;
  var number = Number(value);
  if (!isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function attendanceLabel_(attendance) {
  return attendance === "yes" ? "Буду с радостью" : "Увы, не смогу прийти";
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
