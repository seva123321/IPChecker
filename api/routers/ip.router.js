import express from "express";
import { getIpInfo } from "../controllers/ip.controller.js";

const router = express.Router();

// GET /ip?ip=192.168.1.1
// GET /ip/group
router.get("/", getIpInfo);
router.get("/group", getIpInfo);

export default router;
