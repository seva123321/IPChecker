// controllers/common.controller.js
// GET /data/comment?id=1

import {
  Host,
  Port,
  Whois,
  WhoisKey,
  WellKnownPort,
  sequelize,
  Priority,
  PriorityComment,
  Grouping
} from "../models/index.js";

export const getIpInfo = async (req, res) => {
  try {
    const { id: hostId } = req.query;

    if (!hostId) {
      return res.status(400).json({ error: "Параметр 'id' обязателен" });
    }

    // Получаем комментарий по ID хоста
    const priorityComment = await PriorityComment.findOne({
      where: { host_id: hostId },
      include: [
        {
          model: Priority,
          attributes: ["name"]
        }
      ]
    });

    if (!priorityComment) {
      return res.status(404).json({ 
        message: "Комментарий не найден",
        comment: null 
      });
    }

    return res.json({
      host_id: priorityComment.host_id,
      priority: {
        id: priorityComment.priority_id,
        name: priorityComment.Priority?.name || null
      },
      comment: priorityComment.comment,
      created_at: priorityComment.created_at
    });
  } catch (error) {
    console.error("Ошибка в getIpInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// POST /data/comment
export const postIpInfo = async (req, res) => {
  try {
    // Теперь получаем параметры из body
    const { id: hostId, priority_id, comment } = req.body;

    if (!hostId) {
      return res.status(400).json({ error: "Параметр 'id' обязателен" });
    }

    // Проверяем, существует ли хост
    const host = await Host.findByPk(hostId);
    if (!host) {
      return res.status(404).json({ error: "Хост не найден" });
    }

    // Проверяем, существует ли приоритет, если указан
    if (priority_id) {
      const priority = await Priority.findByPk(priority_id);
      if (!priority) {
        return res.status(404).json({ error: "Приоритет не найден" });
      }
    }

    // Обновляем приоритет хоста
    if (priority_id !== undefined) {
      host.priority_id = priority_id;
      await host.save();
    }

    // Создаем или обновляем комментарий
    if (comment !== undefined && comment !== null && comment.trim() !== '') {
      // Проверяем, существует ли уже комментарий для этого хоста
      let priorityComment = await PriorityComment.findOne({
        where: { host_id: hostId }
      });

      if (priorityComment) {
        // Обновляем существующий комментарий
        priorityComment.comment = comment.trim();
        priorityComment.priority_id = priority_id || host.priority_id;
        priorityComment.created_at = new Date();
        await priorityComment.save();
      } else {
        // Создаем новый комментарий
        await PriorityComment.create({
          host_id: hostId,
          priority_id: priority_id || host.priority_id,
          comment: comment.trim()
        });
      }
    } else if (comment !== undefined && comment.trim() === '') {
      // Удаляем комментарий, если он был пустым
      await PriorityComment.destroy({
        where: { host_id: hostId }
      });
    }

    return res.json({ 
      message: "Данные успешно обновлены",
      host_id: hostId,
      priority_id: host.priority_id,
      comment: comment ? comment.trim() : null
    });
  } catch (error) {
    console.error("Ошибка в postIpInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// PATCH /data/comment
export const patchIpInfo = async (req, res) => {
  try {
    // Получаем параметры из body
    const { id: hostId, priority_id, comment } = req.body;

    if (!hostId) {
      return res.status(400).json({ error: "Параметр 'id' обязателен" });
    }

    // Проверяем, существует ли хост
    const host = await Host.findByPk(hostId);
    if (!host) {
      return res.status(404).json({ error: "Хост не найден" });
    }

    // Проверяем, существует ли приоритет, если указан
    if (priority_id) {
      const priority = await Priority.findByPk(priority_id);
      if (!priority) {
        return res.status(404).json({ error: "Приоритет не найден" });
      }
    }

    // Обновляем приоритет хоста только если он передан
    if (priority_id !== undefined) {
      host.priority_id = priority_id;
      await host.save();
    }

    // Создаем или обновляем комментарий только если он передан
    if (comment !== undefined) {
      if (comment === null || comment.trim() === '') {
        // Удаляем комментарий, если он был пустым
        await PriorityComment.destroy({
          where: { host_id: hostId }
        });
      } else {
        // Проверяем, существует ли уже комментарий для этого хоста
        let priorityComment = await PriorityComment.findOne({
          where: { host_id: hostId }
        });

        if (priorityComment) {
          // Обновляем существующий комментарий
          priorityComment.comment = comment.trim();
          priorityComment.priority_id = priority_id || host.priority_id;
          priorityComment.created_at = new Date();
          await priorityComment.save();
        } else {
          // Создаем новый комментарий
          await PriorityComment.create({
            host_id: hostId,
            priority_id: priority_id || host.priority_id,
            comment: comment.trim()
          });
        }
      }
    }

    return res.json({ 
      message: "Данные успешно обновлены",
      host_id: hostId,
      priority_id: host.priority_id,
      comment: comment !== undefined ? (comment === null || comment.trim() === '' ? null : comment.trim()) : null
    });
  } catch (error) {
    console.error("Ошибка в patchIpInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};
