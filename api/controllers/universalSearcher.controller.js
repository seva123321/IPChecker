import {
  Host,
  Port,
  Whois,
  WhoisKey,
  WellKnownPort,
  sequelize,
  Priority,
  PriorityComment,
  Grouping,
} from "../models/index.js";

export const getInfo = async (req, res) => {
  const {
    ip,
    portOpened,
    portFiltered,
    keyword,
    priority,
    group,
    isWhois,
    dateRange: { startDate, endDate } = {},
  } = req.body;

  //   {
  //     "ip": "8.8.8.8",
  //     "portOpened": "5 (rje), 9 (discard), 13 (daytime), 11 (systat)",
  //     "portFiltered": "7 (echo), 13 (daytime), 56 (xns-auth)",
  //     "keyword": "[2] country, [1] org, [18] role",
  //     "priority": "[2] Интересный",
  //     "group": "[5] Финансовый сектор, [1] МИД, [2] Гражданская промышленность",
  //     "isWhois": true,
  //     "dateRange": {
  //         "startDate": "2024-12-31T23:47:37.017Z",
  //         "endDate": "2025-11-08T23:47:37.018Z"
  //     }
  // }

  // SELECT *
  // FROM your_table
  // WHERE a IN (5, 8, 299);

  // SELECT *
  // FROM your_table
  // WHERE a BETWEEN 5 AND 299; //BETWEEN включает границы диапазона.

  try {
    // отбор по startDate, endDate в hosts.updated_at
    // отбор по Ip
    // отбор по priority
    // отбор по group
    // отбор по isWhois
    // отбор по keyword
    // отбор по portOpened
    // отбор по portFiltered

    return res.json({ body: req.body });
  } catch (error) {
    console.error("Ошибка в getInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};
export const getGrouping = async (req, res) => {
  const {
    ip,
    portOpened,
    portFiltered,
    keyword,
    priority,
    group,
    isWhois,
    dateRange: { startDate, endDate } = {},
  } = req.body;

  try {
    return res.json({ body: req.body });
  } catch (error) {
    console.error("Ошибка в getGrouping:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};
