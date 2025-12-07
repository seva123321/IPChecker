// routes/common.router.js
import express from "express";
import {
  getIpInfo,
  postIpInfo,
  patchIpInfo,
} from "../controllers/comment.controller.js";
import { definingTableType } from "../controllers/common.controller.js";
import { getGrouping } from "../controllers/universalGroup.controller.js";
import {  getInfo } from "../controllers/universalSearcher.controller.js";

const router = express.Router();

// GET /data/comment?id=1
router.get("/comment", getIpInfo);

// POST /data/comment
router.post("/comment", postIpInfo);

// PATCH /data/comment
router.patch("/comment", patchIpInfo);

router.get("/", definingTableType);

// POST /data/info
router.post("/search", getInfo); 

// POST /data/group
router.post("/group", getGrouping);




export default router;