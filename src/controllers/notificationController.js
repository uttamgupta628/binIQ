const { check, validationResult } = require("express-validator");
const Notification = require("../models/Notification");

const createNotification = [
  check("heading").notEmpty().withMessage("Heading is required"),
  check("content").notEmpty().withMessage("Content is required"),
  check("type").notEmpty().withMessage("Content is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { heading, content, type } = req.body;

    try {
      const notification = new Notification({
        user_id: req.user.userId,
        heading,
        content,
        type,
      });

      await notification.save();
      res.status(201).json({
        notification_id: notification._id,
        message: "Notification created successfully",
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", error });
    }
  },
];

const getNotifications = async (req, res) => {
  const { read } = req.query;

  try {
    const query = { user_id: req.user.userId };
    if (read !== undefined) query.read = read === "true";

    const notifications = await Notification.find(query).sort({
      created_at: -1,
    });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

const markNotificationRead = async (req, res) => {
  const { notification_id } = req.params;

  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notification_id, user_id: req.user.userId },
      { read: true },
      { new: true }
    );
    if (!notification)
      return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Notification marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

module.exports = { createNotification, getNotifications, markNotificationRead };
