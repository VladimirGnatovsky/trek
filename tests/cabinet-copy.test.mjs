import test from "node:test";
import assert from "node:assert/strict";
import { categoryLabel, ui } from "../src/cabinet-copy.js";

test("localizes visible labels without changing stored category keys", () => {
  assert.equal(categoryLabel("pl", "Groceries"), "Zakupy spożywcze");
  assert.equal(categoryLabel("uk", "Housing"), "Житло");
  assert.equal(categoryLabel("en", "Groceries"), "Groceries");
});

test("falls back to the source label when a translation is unavailable", () => {
  assert.equal(ui("pl", "Unknown future label"), "Unknown future label");
  assert.equal(ui("uk", "Add transaction"), "Додати транзакцію");
});

test("localizes settings and coach controls", () => {
  assert.equal(ui("pl", "Ask about your money pace."), "Zapytaj o tempo swoich finansów.");
  assert.equal(ui("uk", "Thinking…"), "Аналізую…");
  assert.equal(ui("pl", "COLOR THEME"), "MOTYW KOLORYSTYCZNY");
  assert.equal(ui("uk", "Analyze statement"), "Проаналізувати виписку");
  assert.equal(ui("pl", "Continue to payment"), "Przejdź do płatności");
  assert.equal(ui("pl", "QUICK REPEAT"), "SZYBKIE POWTÓRZENIE");
  assert.equal(ui("uk", "Open a prefilled transaction"), "Відкрити заповнену транзакцію");
  assert.equal(ui("pl", "Accounts"), "Konta");
  assert.equal(ui("uk", "Save transfer"), "Зберегти переказ");
});

test("localizes smart insights and financial calendar", () => {
  assert.equal(ui("uk", "SMART INSIGHTS"), "РОЗУМНІ ПІДКАЗКИ");
  assert.equal(ui("uk", "Your money, at a glance"), "Ваші фінанси одним поглядом");
  assert.equal(ui("pl", "Calculated locally from your records"), "Obliczone lokalnie z Twoich danych");
  assert.equal(ui("uk", "spent in the last 7 days"), "витрачено за останні 7 днів");
  assert.equal(ui("uk", "Keep the pace steady"), "Тримайте стабільний темп");
  assert.equal(ui("uk", "MONEY TIMELINE"), "ФІНАНСОВА ШКАЛА");
  assert.equal(ui("uk", "Financial calendar"), "Фінансовий календар");
  assert.equal(ui("uk", "SAFE FOR THE REST OF MONTH"), "БЕЗПЕЧНО ДО КІНЦЯ МІСЯЦЯ");
  assert.equal(ui("pl", "per day"), "dziennie");
  assert.equal(ui("uk", "Possible recurring payments"), "Можливі регулярні платежі");
});
