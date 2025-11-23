// services/files.service.js

import { exec } from "child_process";
import { promisify } from "util";

import { Host, Port, Whois, WhoisKey, WellKnownPort } from "../models/index.js";


const execAsync = promisify(exec); // For executing shell commands

export default class IpService {
  static async getGroupIp() {
    try {
      const hosts = await Host.findAll({
        include: [
          {
            model: Port,
            attributes: ["port", "type"],
            include: [
              {
                model: WellKnownPort,
                attributes: ["name"],
              },
            ],
          },
          {
            model: Whois,
            attributes: ["value"],
            include: [
              {
                model: WhoisKey,
                attributes: ["key_name"],
              },
            ],
          },
        ],
        order: [["updated_at", "DESC"]],
      });

      const items = hosts.map((host) => {
        const openPorts = [];
        const filteredPorts = [];

        host.Ports.forEach((port) => {
          const portInfo = {
            port: port.port,
            name: port.WellKnownPort?.name || null,
          };

          if (port.type === "open") {
            openPorts.push(portInfo);
          } else if (port.type === "filtered") {
            filteredPorts.push(portInfo);
          }
        });

        const whois = {};
        let hasWhois = false;
        host.Whois.forEach((w) => {
          if (w.WhoisKey && w.value !== null) {
            whois[w.WhoisKey.key_name] = w.value;
            hasWhois = true;
          }
        });

        return {
          id: host.id,
          ip: host.ip,
          country: whois.Country || null,
          has_whois: hasWhois,
          whois,
          updated_at: host.updated_at
            ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
            : null,
          reachable: host.reachable,
          port_data: {
            open: openPorts,
            filtered: filteredPorts,
          },
        };
      });

      return { items };
    } catch (error) {
      console.error("Ошибка в getFileDb:", error);
      throw new Error("Ошибка при получении данных из БД");
    }
  }
}
