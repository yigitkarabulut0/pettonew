import Papa from "papaparse";

export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns?: { key: keyof T; header: string }[]
) {
  const data = columns
    ? rows.map((row) =>
        columns.reduce<Record<string, unknown>>((out, col) => {
          out[col.header] = row[col.key];
          return out;
        }, {})
      )
    : rows;
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
