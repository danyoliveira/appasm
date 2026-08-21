"use client";

import { useRef, useState } from "react";
import { setCompetitionFilter } from "./competitionFilterActions";

export default function CompetitionSwitcher({
  competitions,
  selected,
  allLabel,
}: {
  competitions: { id: number; name: string }[];
  selected: string;
  allLabel: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(selected);

  return (
    <form ref={formRef} action={setCompetitionFilter}>
      <select
        name="competicao"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          formRef.current?.requestSubmit();
        }}
        className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium outline-none focus:border-accent"
      >
        <option value="all">{allLabel}</option>
        {competitions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </form>
  );
}
