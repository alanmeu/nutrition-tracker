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
