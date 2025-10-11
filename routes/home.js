const router = require("express").Router();

router.get("/", (request, response) => {
  return response.render("home", { rayId: request.rayId });
});

module.exports = router;
