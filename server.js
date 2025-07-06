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

// Make the 'clips' folder public so files can be downloaded
app.use('/clips', express.static(path.join(__dirname, 'clips')));

const uploadDir = 'uploads/';
const clipsDir = 'clips/';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `original-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage: storage });

// Endpoint to process the video (this is unchanged)
app.post('/process-video', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).send('No video file uploaded.');
  res.status(202).send('Video received and processing has started in the background.');
  processVideoInBackground(req.file.path, JSON.parse(req.body.clips));
});


// --- NEW ENDPOINT: Get a list of all processed clips ---
app.get('/clips', (req, res) => {
  fs.readdir(clipsDir, (err, files) => {
    if (err) {
      console.error("Could not list the directory.", err);
      return res.status(500).send("Server error.");
    }
    // Send the list of filenames as a JSON array
    res.json(files.filter(file => file.endsWith('.mp4'))); // Ensure we only send mp4 files
  });
});

// The background processing function (this is unchanged)
function processVideoInBackground(inputPath, clips) {
  // ... (the rest of this function is the same as before)
  console.log(`Starting background processing for ${inputPath}`);
  let processedCount = 0;
  const totalClips = clips.length;
  if (totalClips === 0) {
      fs.unlinkSync(inputPath);
      return;
  }
  clips.forEach((clip) => {
    const outputFilename = `${clip.name.replace(/\s+/g, '-')}-${Date.now()}.mp4`;
    const outputPath = path.join(clipsDir, outputFilename);
    ffmpeg(inputPath)
      .setStartTime(clip.start)
      .setDuration(timeToSeconds(clip.end) - timeToSeconds(clip.start))
      .addOutputOptions(['-c:v copy', '-c:a copy'])
      .on('end', () => {
        console.log(`Finished processing ${outputFilename}`);
        processedCount++;
        if (processedCount === totalClips) fs.unlinkSync(inputPath);
      })
      .on('error', (err) => {
        console.error(`Error processing ${outputFilename}:`, err.message);
        processedCount++;
        if (processedCount === totalClips) fs.unlinkSync(inputPath);
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