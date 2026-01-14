const express = require('express');
const bodyParser = require('body-parser');
const tf = require('@tensorflow/tfjs-node');
const fetch = require('node-fetch');

const MODEL_PATH = 'file://./model/model.json'; // ถ้าคุณวาง model ไว้ใน /model ใน container
const PORT = process.env.PORT || 8080;

// ใส่ label ชื่อ class ของโมเดล (เรียงตาม metadata ของ Teachable Machine)
const CLASS_LABELS = ['ไม่พบโรค' ,'โรคไหม้','โรคกาบใบเน่า','โรคใบจุดสีน้ำตาล','โรคถอดฝักดาบ','โรคขอบใบแห้ง','โรคใบขีดโปร่งแสง','โรคข้าวใบหงิก','โรคใบสีส้ม','หนอนม้วนใบข้าว' ,'โรคหนอนกอ', 'โรคเพลี้ยกระโดดสีน้ำตาล','โรคแมลงบั่ว','โรคแมลงด่าง']
  // ตัวอย่าง: 'เสี่ยงโรคA', 'โรคB', 'healthy'
  // ปรับให้ตรงกับโมเดลของคุณ
];

let model = null;

async function loadModel() {
  if (!model) {
    console.log('Loading model from', MODEL_PATH);
    model = await tf.loadGraphModel(MODEL_PATH);
    console.log('Model loaded');
  }
}

// ฟังก์ชัน preprocess: ปรับขนาดเป็น 224x224 (ปรับถ้าโมเดลของคุณใช้ขนาดอื่น)
function preprocessImage(imageBuffer, targetSize = 224) {
  const decode = tf.node.decodeImage(new Uint8Array(imageBuffer), 3);
  const resized = tf.image.resizeBilinear(decode, [targetSize, targetSize]);
  const normalized = resized.div(tf.scalar(255.0));
  const batched = normalized.expandDims(0);
  return batched;
}

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));

app.post('/predict', async (req, res) => {
  try {
    await loadModel();

    let imageBuffer = null;
    if (req.body.image_base64) {
      imageBuffer = Buffer.from(req.body.image_base64, 'base64');
    } else if (req.body.image_url) {
      const r = await fetch(req.body.image_url);
      if (!r.ok) return res.status(400).json({ error: 'cannot fetch image' });
      imageBuffer = Buffer.from(await r.arrayBuffer());
    } else {
      return res.status(400).json({ error: 'no image provided' });
    }

    const inputTensor = preprocessImage(imageBuffer, 224);
    const prediction = model.predict(inputTensor);
    const scores = prediction.dataSync(); // หรือ await prediction.data()
    // หา argmax
    let max = -Infinity;
    let idx = -1;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > max) {
        max = scores[i];
        idx = i;
      }
    }
    const label = CLASS_LABELS[idx] || `class_${idx}`;
    const confidence = max;

    return res.json({ label, confidence });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.toString() });
  }
});

app.get('/', (req, res) => res.send('TeachableMachine predictor is running'));

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));