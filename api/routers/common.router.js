// routes/common.router.js
import express from "express";
import {
  getIpInfo,
  postIpInfo,
  patchIpInfo,
} from "../controllers/comment.controller.js";
import { definingTableType } from "../controllers/common.controller.js";

const router = express.Router();

// GET /data/comment?id=1
router.get("/comment", getIpInfo);

// POST /data/comment
router.post("/comment", postIpInfo);

// PATCH /data/comment
router.patch("/comment", patchIpInfo);

router.get("/", definingTableType);

export default router;
// // routes/common.router.js
// import express from "express";
// import {
//   getIpInfoGroup,
//   postIpInfoGroup,
//   patchIpInfoGroup,
// } from "../controllers/grouping.controller.js";
// import {
//   getIpInfo,
//   postIpInfo,
//   patchIpInfo,
// } from "../controllers/common.controller.js";

// const router = express.Router();

// // GET /data/comment?id=1
// router.get("/comment", getIpInfo);

// // POST /data/comment
// router.post("/comment", postIpInfo);

// // PATCH /data/comment
// router.patch("/comment", patchIpInfo);

// // GET /data/comment?id=1
// router.get("/grouping", getIpInfoGroup);

// // POST /data/comment
// router.post("/grouping", postIpInfoGroup);

// // PATCH /data/comment
// router.patch("/grouping", patchIpInfoGroup);

// export default router;
