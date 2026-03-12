const { Parser } = require("json2csv");
const ExcelJS = require("exceljs");

const exportCSV = async (res, data, filename = "export") => {
  try {
    const parser = new Parser();
    const csv = parser.parse(data);

    res.header("Content-Type", "text/csv");
    res.attachment(`${filename}.csv`);

    return res.send(csv);
  } catch (error) {
    console.error("CSV export error:", error);
    res.status(500).json({ success: false, message: "CSV export failed" });
  }
};

const exportExcel = async (res, data, filename = "export") => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sheet1");

    if (data.length === 0) {
      worksheet.addRow(["No Data"]);
    } else {
      const columns = Object.keys(data[0]).map((key) => ({
        header: key,
        key,
      }));

      worksheet.columns = columns;

      data.forEach((row) => {
        worksheet.addRow(row);
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${filename}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Excel export error:", error);
    res.status(500).json({ success: false, message: "Excel export failed" });
  }
};
const exportMultiSheetExcel = async (res, sheets, filename = "export") => {
  try {
    const workbook = new ExcelJS.Workbook();

    sheets.forEach((sheet) => {
      const worksheet = workbook.addWorksheet(sheet.name);

      if (!sheet.data || sheet.data.length === 0) {
        worksheet.addRow(["No Data"]);
        return;
      }

      const columns = Object.keys(sheet.data[0]).map((key) => ({
        header: key,
        key,
      }));

      worksheet.columns = columns;

      sheet.data.forEach((row) => {
        worksheet.addRow(row);
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${filename}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Multi sheet export error:", error);
    res.status(500).json({
      success: false,
      message: "Excel export failed",
    });
  }
};


module.exports = {
  exportCSV,
  exportExcel,
  exportMultiSheetExcel,
};