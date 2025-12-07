import {
  WhoisKey,
  WellKnownPort,
  sequelize,
  Priority,
  Grouping,
  Country,
} from "../models/index.js";

export const definingTableType = (req, res) => {
  const { q } = req.query;

  switch (q) {
    case "ports":
      getPortTable(req, res);
      break;
    case "portsOpened":
      getPortOneTypeOfTable(req, res, "open");
      break;
    case "portsFiltered":
      getPortOneTypeOfTable(req, res, "filtered");
      break;
    case "priority":
      getPriorityTable(req, res);
      break;
    case "group":
      getGroupTable(req, res);
      break;
    case "keywords":
      getKeywordsTable(req, res);
      break;
    case "country":
      getCountryTable(req, res);
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
    const [portsOpened] = await sequelize.query(
      `
      SELECT DISTINCT wp.port, wp.name
      FROM well_known_ports wp
      JOIN ports p ON wp.port = p.port
      WHERE p.type = :type
      ORDER BY wp.port ASC;
    `,
      {
        replacements: { type },
      }
    );

    if (portsOpened.length === 0) {
      return res
        .status(404)
        .json({ error: "Нет результатов удовлетворяющих поиску" });
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

export const getCountryTable = async (req, res) => {
  try {
    // Вариант 1: Использовать простой findAll, так как в таблице уже уникальные названия стран
    const countries = await Country.findAll({
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
      raw: true,
    });

    // Вариант 2: Если нужен DISTINCT, использовать raw query
    // const [countries] = await sequelize.query(
    //   `SELECT DISTINCT id, name FROM countries ORDER BY name ASC`,
    //   {
    //     type: sequelize.QueryTypes.SELECT,
    //     raw: true,
    //   }
    // );

    if (!countries || countries.length === 0) {
      return res.status(404).json({
        error: "Нет результатов удовлетворяющих поиску",
        data: []
      });
    }

    const data = countries.map((item) => ({
      id: item.id,
      name: item.name,
    }));

    return res.json({ data });
  } catch (error) {
    console.error("Ошибка в getCountryTable:", error);
    return res
      .status(500)
      .json({ error: "Нет результатов удовлетворяющих поиску" });
  }
};


export const getKeywordsTable = async (req, res) => {
  try {
    const whoisData = await WhoisKey.findAll({
      attributes: ["id", "key_name"],
    });

    const data = whoisData.map((item) => ({
      id: item.id,
      name: item.key_name,
    }));
    return res.json({ data });
  } catch (error) {
    console.error("Ошибка в getGroupTable:", error);
    return res
      .status(500)
      .json({ error: "Нет результатов удовлетворяющих поиску" });
  }
};
