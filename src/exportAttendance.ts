import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { attendanceRate } from './domain';
import type { ChurchData } from './types';

export type ExportFormat = 'csv' | 'excel';

const header = ['Member', 'Mobile', 'Email', 'Service', 'Location', 'Date', 'Time', 'Checked in at (ISO)', 'Attendance %', 'Attended / Eligible services'];

export function buildExportRows(data: ChurchData): string[][] {
  const rateByMember = new Map<string, ReturnType<typeof attendanceRate>>();
  function rateFor(memberId: string) {
    let rate = rateByMember.get(memberId);
    if (!rate) {
      const member = data.profiles.find(profile => profile.id === memberId);
      rate = member ? attendanceRate(data.services, data.attendance, member) : { attended: 0, eligible: 0, percentage: null };
      rateByMember.set(memberId, rate);
    }
    return rate;
  }
  const rows = data.attendance
    .slice()
    .sort((first, second) => Date.parse(second.checked_in_at) - Date.parse(first.checked_in_at))
    .map(record => {
      const member = data.profiles.find(profile => profile.id === record.member_id);
      const service = data.services.find(item => item.id === record.service_id);
      const when = new Date(record.checked_in_at);
      const rate = rateFor(record.member_id);
      return [
        member?.full_name ?? 'Unknown member',
        member?.phone ?? '',
        member?.email ?? '',
        service?.title ?? 'Unknown service',
        service?.location ?? '',
        when.toLocaleDateString('en-US'),
        when.toLocaleTimeString('en-US'),
        record.checked_in_at,
        rate.percentage === null ? 'N/A' : `${rate.percentage}%`,
        `${rate.attended}/${rate.eligible}`,
      ];
    });
  return [header, ...rows];
}

function escapeCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: string[][]): string {
  return rows.map(row => row.map(escapeCsv).join(',')).join('\r\n');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// SpreadsheetML (Excel 2003 XML): Excel opens it natively, no zip/XLSX library needed.
function toExcelXml(rows: string[][]): string {
  const body = rows
    .map(row => `<Row>${row.map(cell => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>`)
    .join('');
  return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Worksheet ss:Name="Attendance"><Table>${body}</Table></Worksheet>\n</Workbook>`;
}

export async function exportAttendance(data: ChurchData, format: ExportFormat): Promise<void> {
  const rows = buildExportRows(data);
  const content = format === 'csv' ? toCsv(rows) : toExcelXml(rows);
  const extension = format === 'csv' ? 'csv' : 'xls';
  const mimeType = format === 'csv' ? 'text/csv' : 'application/vnd.ms-excel';
  const fileName = `attendance-${new Date().toISOString().slice(0, 10)}.${extension}`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: 'utf8' });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType, dialogTitle: fileName });
  else throw new Error('Sharing is not available on this device.');
}
