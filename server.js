const express = require("express");
const http = require("http");
const cron = require("node-cron");
const app = express();
require("dotenv").config();
const path = require("path");
const cors = require("cors");

const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: process.env.ALLOWED_CLIENTS.split(","),
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.static("public"));
app.set("views", path.join(__dirname, "/views"));
app.set("view engine", "ejs");

app.use("/", require("./routes/home"));
app.use("/uploaded-files", require("./routes/listing"));
app.use("/cleanup", require("./routes/cleanup"));
app.use("/api/files", require("./routes/files"));
app.use("/files", require("./routes/filePreview"));
app.use("/files/download", require("./routes/download"));
app.get('/privacy', (req, res) => { res.render('privacy'); });
app.get('/tos', (req, res) => { res.render('tos'); });
app.get("/report", (req, res) => { res.render("abuse"); });
app.get("/license", (req, res) => { res.render("license"); });


const server = app.listen(PORT, () => {
  console.log(`Listening to port ${PORT}`);
});

// Schedule cron job for cleanup
cron.schedule("0 0 * * *", () => {
  console.log("Running cleanup cron job");
  const options = {
    hostname: "https://synkross.alwaysdata.net/",
    port: PORT,
    path: "/cleanup",
    method: "GET",
  };

  const req = http.request(options, (res) => {
    console.log(`Cleanup request status code: ${res.statusCode}`);
    res.on("data", (d) => {
      process.stdout.write(d);
    });
  });

  req.on("error", (error) => {
    console.error("Error running cleanup cron job:", error);
  });

  req.end();
});
