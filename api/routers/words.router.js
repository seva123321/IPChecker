// routes/keywords.routes.js
import express from "express";
import { getKeywordInfo, groupKeywords } from "../controllers/words.controller.js";

const router = express.Router();

// GET /keywords?keyword=google
// GET /keywords/group
router.get("/", getKeywordInfo);
router.get("/group", groupKeywords);

export default router;

// import express from "express";
// import { getWordInfo, groupWord } from "../controllers/words.controller.js";

// const router = express.Router();

// // GET /words?word=hello
// // GET /words/group?word=hello
// router.get("/", getWordInfo);
// router.get("/group", groupWord);

// export default router;


