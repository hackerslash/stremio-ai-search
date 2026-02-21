const { getApp } = require("../server");

module.exports = async (req, res) => {
  const app = await getApp();
  return app(req, res);
};
