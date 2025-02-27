const express = require("express");
const app = express();
const morgan = require("morgan");
const mongoose = require("mongoose");
const cors = require("cors");
const authJwt = require('./helpers/jwt');
const errorHandler = require('./helpers/error-handler');
require("dotenv/config");

app.use(cors());
app.options("*", cors());

//middleware
app.use(express.json());
app.use(morgan('tiny'));
app.use(authJwt());
app.use(errorHandler);
app.use("/public/uploads", express.static(__dirname + "/public/uploads"));

//Routes
const usersRoutes = require("./routes/users");
const eventRoutes = require("./routes/event")
const questionnaireRoutes = require('./routes/questionnaire');
const ratingsRoutes = require("./routes/rating")
const attendanceRoutes = require("./routes/attendance")
const traitRoutes = require("./routes/trait")
const questionRoutes = require("./routes/question")
const responseRoutes = require("./routes/response")
const postRoutes = require("./routes/post")
const typeRoutes = require("./routes/type")
const organizationRoutes = require("./routes/organization")

const api = process.env.API_URL;

app.use(`${api}/users`, usersRoutes);
app.use(`${api}/questionnaires`, questionnaireRoutes);
app.use(`${api}/events`, eventRoutes);
app.use(`${api}/ratings`, ratingsRoutes);
app.use(`${api}/attendance`, attendanceRoutes);
app.use(`${api}/traits`, traitRoutes);
app.use(`${api}/questions`, questionRoutes);
app.use(`${api}/responses`, responseRoutes);
app.use(`${api}/posts`, postRoutes);
app.use(`${api}/types`, typeRoutes);
app.use(`${api}/organizations`, organizationRoutes);

app.get("/", (req, res) => {
  res.send("Server is running");
});

//Database
mongoose
  .connect(process.env.CONNECTION_STRING, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    // dbName: "eshop",
  })
  .then(() => {
    console.log("Database Connection is ready...");
  })
  .catch((err) => {
    console.log(err);
  });

//Server
app.listen(4000, () => {
  console.log("server is running http://localhost:4000");
});