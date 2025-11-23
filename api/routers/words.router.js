import express from "express";
import { getKeywordInfo, groupKeywords, getOneKeywordInfo } from "../controllers/words.controller.js";

const router = express.Router();

router.get("/", getKeywordInfo);
router.get("/group", groupKeywords);
router.get("/search", getOneKeywordInfo);

export default router;
