const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const uploadDir = 'uploads/';
const clipsDir = 'clips/';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `original-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage: storage });

// --- THE NEW ASYNCHRONOUS LOGIC ---
app.post('/process-video', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No video file uploaded.');
  }

  // 1. Immediately send a success response to the app
  res.status(202).send('Video received and processing has started in the background.');

  // 2. Start the long FFMPEG process after the response has been sent
  processVideoInBackground(req.file.path, JSON.parse(req.body.clips));
});


// This function runs in the background and does the heavy lifting
function processVideoInBackground(inputPath, clips) {
  console.log(`Starting background processing for ${inputPath}`);
  console.log('Clips to process:', clips);

  let processedCount = 0;
  const totalClips = clips.length;

  if (totalClips === 0) {
      console.log("No clips to process. Deleting original file.");
      fs.unlinkSync(inputPath);
      return;
  }

  clips.forEach((clip, index) => {
    const outputFilename = `${clip.name.replace(/\s+/g, '-')}-${Date.now()}.mp4`;
    const outputPath = path.join(clipsDir, outputFilename);

    ffmpeg(inputPath)
      .setStartTime(clip.start)
      .setDuration(timeToSeconds(clip.end) - timeToSeconds(clip.start))
      .videoCodec('libx264')
      .addOutputOption('-preset', 'veryfast')
      .addOutputOption('-crf', '23')
      .audioCodec('aac')
      .on('end', () => {
        console.log(`Finished processing ${outputFilename}`);
        processedCount++;
        if (processedCount === totalClips) {
          console.log('All background clips processed. Deleting original file.');
          fs.unlinkSync(inputPath); // Clean up original video
        }
      })
      .on('error', (err) => {
        console.error(`Error processing ${outputFilename}:`, err.message);
        processedCount++; // Still increment to allow cleanup
        if (processedCount === totalClips) {
          console.log('Finished background processing with errors. Deleting original file.');
          fs.unlinkSync(inputPath); // Clean up original video
        }
      })
      .save(outputPath);
  });
}

function timeToSeconds(time) {
  const parts = time.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(time);
}

app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${port}`);
});