/**
 * ตัวอย่าง Apps Script ที่:
 * - ตรวจหาแถวใหม่ที่มี URL รูปในคอลัมน์ "Dignosis(รูป)"
 * - ส่งรูป (base64) ไปที่ prediction endpoint
 * - เขียนผล (label + confidence) ลงคอลัมน์ "DiagnosisResult"
 *
 * ปรับค่า SHEET_NAME, IMAGE_COLUMN_INDEX, RESULT_COLUMN_INDEX ให้ตรงกับ sheet ของคุณ
 */

// ตั้งค่าตรงนี้
const SHEET_NAME = 'Dignosis'; // ชื่อ sheet
const IMAGE_COLUMN_INDEX = 2;   // ตัวอย่าง: คอลัมน์ B = 2 (ปรับตามตำแหน่งของรูป)
const RESULT_COLUMN_INDEX = 3;  // ตัวอย่าง: คอลัมน์ C = 3 (จะเขียนผลที่นี่)
const PREDICT_ENDPOINT = 'https://YOUR_CLOUD_RUN_URL/predict'; // เปลี่ยนเป็น endpoint ของคุณ
const PROCESS_TAG_COLUMN = 4; // คอลัมน์สถานะ (optional) เพื่อไม่ให้ประมวลผลซ้ำ

function processNewRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('ไม่พบ sheet: ' + SHEET_NAME);
    return;
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return; // ไม่มีข้อมูล
  const range = sheet.getRange(2, 1, lastRow - 1, Math.max(IMAGE_COLUMN_INDEX, RESULT_COLUMN_INDEX, PROCESS_TAG_COLUMN));
  const values = range.getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const imageCell = row[IMAGE_COLUMN_INDEX - 1];
    const statusCell = row[PROCESS_TAG_COLUMN - 1];
    const resultCell = row[RESULT_COLUMN_INDEX - 1];

    // ข้ามถ้ามีผลแล้วหรือถูกทำเครื่องหมายแล้ว
    if (resultCell && resultCell.toString().trim() !== '') continue;
    if (statusCell && statusCell.toString().toLowerCase() === 'processed') continue;

    if (imageCell && imageCell.toString().trim() !== '') {
      try {
        const imageUrl = imageCell.toString().trim();

        // ดึงรูปจาก URL (Appsheet มักใส่เป็น URL)
        const res = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
        if (res.getResponseCode() !== 200) {
          sheet.getRange(i + 2, PROCESS_TAG_COLUMN).setValue('image fetch error: ' + res.getResponseCode());
          continue;
        }
        const blob = res.getBlob();
        const base64 = Utilities.base64Encode(blob.getBytes());

        // เรียก endpoint
        const payload = {
          image_base64: base64,
          image_mime: blob.getContentType()
        };
        const options = {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
          timeout: 60000
        };
        const r = UrlFetchApp.fetch(PREDICT_ENDPOINT, options);
        const code = r.getResponseCode();
        if (code !== 200) {
          sheet.getRange(i + 2, PROCESS_TAG_COLUMN).setValue('predict error: ' + code);
          continue;
        }
        const json = JSON.parse(r.getContentText());
        // คาดว่า json มี: { label: "...", confidence: 0.94 }
        const label = json.label || '';
        const confidence = json.confidence !== undefined ? (json.confidence * 100).toFixed(2) + '%' : '';
        const text = label ? `${label} (${confidence})` : 'no-prediction';

        // เขียนผลและทำเครื่องหมาย
        sheet.getRange(i + 2, RESULT_COLUMN_INDEX).setValue(text);
        sheet.getRange(i + 2, PROCESS_TAG_COLUMN).setValue('processed');
      } catch (err) {
        Logger.log('error row ' + (i + 2) + ': ' + err);
        sheet.getRange(i + 2, PROCESS_TAG_COLUMN).setValue('error: ' + err.toString().substring(0, 200));
      }
    }
  }
}

/**
 * (เลือก) สร้าง trigger ผ่าน UI: Edit > Current project's triggers
 * ให้เรียก processNewRows ทุก ๆ 1 นาที หรือ onChange ตามต้องการ
 */