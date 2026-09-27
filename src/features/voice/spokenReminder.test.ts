import { describe, expect, it } from "vitest";
import {
  findLeadingSpokenReminder,
  findSpokenReminder,
} from "./spokenReminder";

// Thursday, October 1, 2026, 14:20 local time.
const now = new Date(2026, 9, 1, 14, 20, 0);

function at(text: string): string | null {
  const reminder = findSpokenReminder(text, now);
  if (!reminder) return null;
  const d = reminder.at;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

describe("spoken reminders", () => {
  it.each([
    ["lembrete amanhã às 10", "02/10 10:00"],
    ["Lembre-me amanhã às 10h30", "02/10 10:30"],
    ["remind me tomorrow at 3pm", "02/10 15:00"],
    ["reminder tomorrow at 9:15 am", "02/10 09:15"],
    ["lembrete depois de amanhã", "03/10 09:00"],
    ["remind me the day after tomorrow at noon", "03/10 12:00"],
    ["lembrete sexta às 15h", "02/10 15:00"],
    ["lembre-me na sexta-feira às 9", "02/10 09:00"],
    ["remind me on monday at 8", "05/10 08:00"],
    ["lembrete às 4 da tarde", "01/10 16:00"],
    ["lembrete às 3", "01/10 15:00"],
    ["reminder at 7 in the morning", "02/10 07:00"],
    ["lembrete ao meio-dia", "02/10 12:00"],
    ["lembrete em 2 horas", "01/10 16:20"],
    ["remind me in 30 minutes", "01/10 14:50"],
    ["lembrete daqui a um dia", "02/10 14:20"],
  ])("%s → %s", (phrase, expected) => {
    expect(at(phrase)).toBe(expected);
  });

  it("moves today's weekday to next week once its time has passed", () => {
    expect(at("remind me on Thursday at 9")).toBe("08/10 09:00");
    expect(at("remind me on Thursday at 18h")).toBe("01/10 18:00");
    expect(at("remind me on Wednesday at 9")).toBe("07/10 09:00");
  });

  it("ignores a phrase that resolves to the past", () => {
    expect(at("lembrete hoje às 9")).toBeNull();
  });

  it("ignores reminder words without a day or time", () => {
    expect(at("lembre-me de ligar para a gráfica")).toBeNull();
  });

  it("reports where the phrase is, so it can be removed from the text", () => {
    const text = "Crie uma lista, lembrete amanhã às 10";
    const reminder = findSpokenReminder(text, now);
    expect(reminder && text.slice(reminder.index)).toBe(
      "lembrete amanhã às 10",
    );
  });

  it("finds a leading phrase only at the start", () => {
    expect(
      findLeadingSpokenReminder("Remind me tomorrow at 9 to call Ana", now)
        ?.length,
    ).toBe("Remind me tomorrow at 9".length);
    expect(
      findLeadingSpokenReminder("Call Ana, remind me tomorrow at 9", now),
    ).toBeNull();
  });
});
