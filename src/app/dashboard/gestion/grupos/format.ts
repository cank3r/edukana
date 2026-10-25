const dayFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function groupDates(startsOn: Date, endsOn: Date | null) {
  return endsOn ? `Del ${dayFormat.format(startsOn)} al ${dayFormat.format(endsOn)}` : `Desde el ${dayFormat.format(startsOn)}`;
}

export function groupOccupancy(members: number, capacity: number | null) {
  if (capacity === null) return members === 1 ? "1 estudiante" : `${members} estudiantes`;
  return `${members} de ${capacity} estudiantes`;
}
