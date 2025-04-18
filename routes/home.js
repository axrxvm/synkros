const router = require("express").Router();

router.get("/", (request, response) => {
  return response.render("home");
});

module.exports = router;
