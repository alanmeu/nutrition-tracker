import React, { useEffect, useMemo, useState } from "react";
import MenuDay from "../../components/MenuDay";
import { DAY_KEYS } from "../../utils/mealPlanner";

export default function MenuClient({ weeklyMenus }) {
  const [selectedMenuId, setSelectedMenuId] = useState("");

  useEffect(() => {
    if (!weeklyMenus?.length) {
      setSelectedMenuId("");
      return;
    }
    setSelectedMenuId(weeklyMenus[0].id);
  }, [weeklyMenus]);

  const selectedMenu = useMemo(() => {
    if (!weeklyMenus?.length) return null;
    return weeklyMenus.find((menu) => menu.id === selectedMenuId) || weeklyMenus[0];
  }, [weeklyMenus, selectedMenuId]);

  const totalMenus = Array.isArray(weeklyMenus) ? weeklyMenus.length : 0;
  const downloadMenu = () => {
    if (!selectedMenu) return;
    const lines = [`Menu hebdomadaire - Semaine du ${selectedMenu.weekStart}`, ""];
    if (selectedMenu.notes) {
      lines.push(`Note coach: ${selectedMenu.notes}`, "");
    }
    for (const day of DAY_KEYS) {
      const meals = selectedMenu.plan?.[day.key] || {};
      lines.push(day.label);
      lines.push(`- Petit-dejeuner: ${meals.breakfast || "-"}`);
      lines.push(`- Dejeuner: ${meals.lunch || "-"}`);
      lines.push(`- Diner: ${meals.dinner || "-"}`);
      lines.push(`- Collation: ${meals.snack || "-"}`);
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `menu-${selectedMenu.weekStart}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="dashboard-grid menu-page">
      <section className="panel panel-highlight menu-hero">
        <div className="row-between">
          <div>
            <p className="eyebrow">Nutrition Cloud</p>
            <h3>Menu hebdomadaire</h3>
            <p className="info-text">Ton plan repas de la semaine, simple et motivant.</p>
          </div>
          {weeklyMenus?.length ? (
            <select
              className="menu-week-select"
              value={selectedMenu?.id || ""}
              onChange={(event) => setSelectedMenuId(event.target.value)}
            >
              {weeklyMenus.map((menu) => (
                <option key={menu.id} value={menu.id}>
                  Semaine du {menu.weekStart}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="menu-meta">
          <span className="menu-pill">{totalMenus} semaine{totalMenus > 1 ? "s" : ""} disponible{totalMenus > 1 ? "s" : ""}</span>
          {selectedMenu?.weekStart ? (
            <span className="menu-pill">Semaine active: {selectedMenu.weekStart}</span>
          ) : null}
          {selectedMenu ? (
            <button className="ghost" type="button" onClick={downloadMenu}>
              Telecharger le menu
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel menu-panel">
        {!selectedMenu ? (
          <p>Aucun menu envoye par ton coach pour le moment.</p>
        ) : (
          <>
            {selectedMenu.notes ? (
              <p className="menu-note">
                <strong>Note coach:</strong> {selectedMenu.notes}
              </p>
            ) : null}

            <div className="menu-days-stack menu-days-two-cols menu-days-centered">
              {DAY_KEYS.map((day) => (
                <MenuDay
                  key={day.key}
                  dayLabel={day.label}
                  meals={selectedMenu.plan?.[day.key]}
                  readOnly
                />
              ))}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
