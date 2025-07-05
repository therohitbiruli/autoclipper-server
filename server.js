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

// --- Setup storage ---
const uploadDir = 'uploads/';
const clipsDir = 'clips/';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `original-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage: storage });

// --- Video Processing Endpoint ---
app.post('/process-video', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).send('No video file uploaded.');

  const clips = JSON.parse(req.body.clips);
  const inputPath = req.file.path;
  console.log(`Processing ${inputPath} with clips:`, clips);

  let processedCount = 0;
  const totalClips = clips.length;

  if (totalClips === 0) return res.status(400).send('No timestamps provided.');

  clips.forEach((clip, index) => {
    const outputFilename = `${clip.name.replace(/\s+/g, '-')}-${Date.now()}.mp4`;
    const outputPath = path.join(clipsDir, outputFilename);

    console.log(`Creating clip: ${clip.name} from ${clip.start} to ${clip.end}`);

    // This logic now mirrors your Python script
    ffmpeg(inputPath)
      .setStartTime(clip.start)
      .setDuration(timeToSeconds(clip.end) - timeToSeconds(clip.start)) // Calculate duration from start/end times
      .videoCodec('libx264')
      .addOutputOption('-preset', 'veryfast')
      .addOutputOption('-crf', '23')
      .audioCodec('aac')
      .on('end', () => {
        console.log(`Finished processing ${outputFilename}`);
        processedCount++;
        if (processedCount === totalClips) {
          fs.unlinkSync(inputPath); // Clean up original video
          res.status(200).send('All clips processed successfully!');
        }
      })
      .on('error', (err) => {
        console.error(`Error processing ${outputFilename}:`, err.message);
        processedCount++; // Increment even on error to avoid hanging
        if (processedCount === totalClips) {
            fs.unlinkSync(inputPath); // Clean up
            res.status(500).send('An error occurred while processing one or more clips.');
        }
      })
      .save(outputPath);
  });
});

// Helper function to convert HH:MM:SS string to seconds
function timeToSeconds(time) {
  const parts = time.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(time); // Fallback for raw seconds
}


app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${port}`);
});