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

export const definingTableType = (req, res) => {
  const { q } = req.query;

  switch (q) {
    case "ports":
      getPortTable(req, res);
      break;
    case "portsOpened":
      getPortOneTypeOfTable(req, res, 'open');
      break;
    case "portsFiltered":
      getPortOneTypeOfTable(req, res, 'filtered');
      break;
    case "priority":
      getPriorityTable(req, res);
      break;
    case "group":
      getGroupTable(req, res);
      break;

    default:
      break;
  }
};

export const getPortTable = async (req, res) => {
  try {
    const wellKnownPorts = await WellKnownPort.findAll({
      attributes: ["port", "name"],
      order: [["port", "ASC"]],
    });

    const data = wellKnownPorts.map((item) => ({
      port: item.port,
      name: item.name,
    }));

    return res.json({ data });
  } catch (error) {
    console.error("Ошибка в getPortTable:", error);
    return res
      .status(500)
      .json({ error: "Нет результатов удовлетворяющих поиску" });
  }
};

export const getPortOneTypeOfTable = async (req, res, type) => {
  try {
    const [portsOpened] = await sequelize.query(`
      SELECT DISTINCT wp.port, wp.name
      FROM well_known_ports wp
      JOIN ports p ON wp.port = p.port
      WHERE p.type = :type
      ORDER BY wp.port ASC;
    `, {
      replacements: { type },
    });

    if (portsOpened.length === 0) {
      return res.status(404).json({ error: "Нет результатов удовлетворяющих поиску" });
    }

    const data = portsOpened.map((item) => ({
      port: item.port,
      name: item.name,
    }));

    return res.json({ data });
  } catch (error) {
    console.error("Ошибка в getPortOneTypeOfTable:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

export const getPriorityTable = async (req, res) => {
  try {
    const priorityData = await Priority.findAll({
      attributes: ["id", "name"],
      order: [["id", "DESC"]],
    });

    const data = priorityData.map((item) => ({
      id: item.id,
      name: item.name,
    }));
    return res.json({ data });
  } catch (error) {
    console.error("Ошибка в getPriorityTable:", error);
    return res
      .status(500)
      .json({ error: "Нет результатов удовлетворяющих поиску" });
  }
};

export const getGroupTable = async (req, res) => {
  try {
    const groupsData = await Grouping.findAll({
      attributes: ["id", "name"],
    });

    const data = groupsData.map((item) => ({
      id: item.id,
      name: item.name,
    }));
    return res.json({ data });
  } catch (error) {
    console.error("Ошибка в getGroupTable:", error);
    return res
      .status(500)
      .json({ error: "Нет результатов удовлетворяющих поиску" });
  }
};
