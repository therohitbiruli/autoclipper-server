const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Tell fluent-ffmpeg where to find the ffmpeg executable
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json()); // Important for receiving JSON data

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

// --- New Processing Endpoint ---
app.post('/process-video', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No video file uploaded.');
  }

  // Timestamps will be sent as a JSON string
  const clips = JSON.parse(req.body.clips);
  const inputPath = req.file.path;

  console.log(`Received video: ${req.file.filename}`);
  console.log('Clips to process:', clips);

  let processedClips = [];
  let clipsProcessed = 0;

  if (clips.length === 0) {
    return res.status(400).send('No timestamps provided.');
  }

  // Process each clip
  clips.forEach((clip, index) => {
    const outputFilename = `${clip.name.replace(/\s+/g, '-') || `clip-${index + 1}`}-${Date.now()}.mp4`;
    const outputPath = path.join(clipsDir, outputFilename);

    ffmpeg(inputPath)
      .setStartTime(clip.start)
      .setDuration(parseFloat(clip.end) - parseFloat(clip.start))
      .output(outputPath)
      .on('end', () => {
        console.log(`Finished processing ${outputFilename}`);
        processedClips.push({ name: clip.name, path: outputPath });
        clipsProcessed++;
        if (clipsProcessed === clips.length) {
          // Once all clips are done, send a success response
          console.log('All clips processed successfully.');
          // Optional: Delete the original uploaded video
          fs.unlinkSync(inputPath);
          res.status(200).json({
            message: 'All clips processed successfully!',
            clips: processedClips,
          });
        }
      })
      .on('error', (err) => {
        console.error(`Error processing clip ${index + 1}:`, err.message);
        // Handle error, maybe stop processing other clips or just log it
        clipsProcessed++; // Still count it to avoid hanging
         if (clipsProcessed === clips.length) {
            fs.unlinkSync(inputPath); // Clean up
            res.status(500).send('Error processing one or more clips.');
        }
      })
      .run();
  });
});

app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${port}`);
});