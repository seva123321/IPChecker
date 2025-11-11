import { sequelize } from "../models/index.js";
import { QueryTypes } from "sequelize";

export default class FileRepository {
  static async setJSONData(data) {
    try {
      const openPorts = Array.isArray(data.openPorts) ? data.openPorts : [];
      const filteredPorts = Array.isArray(data.filteredPorts)
        ? data.filteredPorts
        : [];

      const openPortsStr =
        openPorts.length > 0 ? `{${openPorts.join(",")}}` : "{}";
      const filteredPortsStr =
        filteredPorts.length > 0 ? `{${filteredPorts.join(",")}}` : "{}";

      const sql = `
        SELECT upsert_host_with_data(
          :ip,
          :reachable,
          :openPorts::INTEGER[],
          :filteredPorts::INTEGER[],
          :whoisData::JSONB
        );
      `;

      await sequelize.query(sql, {
        replacements: {
          ip: data.ip,
          reachable: data.reachable,
          openPorts: openPortsStr,
          filteredPorts: filteredPortsStr,
          whoisData: data.whoisData,
        },
        type: QueryTypes.RAW,
      });

      return { success: true };
    } catch (error) {
      console.error("Ошибка при вызове upsert_host_with_", error);
      console.error("Подробности ошибки:", error.stack);
      throw error;
    }
  }
}
