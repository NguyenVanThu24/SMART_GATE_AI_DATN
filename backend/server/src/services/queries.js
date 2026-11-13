exports.LOG_SQL = `SELECT a.*, g.name AS gate_name, COALESCE(e.full_name, vs.full_name) AS owner
  FROM access_logs a JOIN gates g ON g.id=a.gate_id
  LEFT JOIN vehicles v ON v.id=a.vehicle_id LEFT JOIN employees e ON e.id=v.employee_id
  LEFT JOIN visitors vs ON vs.id=a.visitor_id`;
exports.normPlate = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
exports.PLATE_EXPR = "REGEXP_REPLACE(UPPER(plate_number),'[^A-Z0-9]','')";
