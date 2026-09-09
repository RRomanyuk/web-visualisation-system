import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import SourceForm from "../components/SourceForm.jsx";
import DatasetList from "../components/DatasetList.jsx";
import DatasetPreview from "../components/DatasetPreview.jsx";
import ProcessPanel from "../components/ProcessPanel.jsx";

export default function DataPage() {
  const [datasets, setDatasets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const refresh = useCallback(async () => {
    setDatasets(await api.datasets.list());
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  function handleCreated(ds) {
    setDatasets((prev) => [ds, ...prev.filter((d) => d.id !== ds.id)]);
    setSelectedId(ds.id);
  }

  async function handleDelete(id) {
    await api.datasets.remove(id);
    if (selectedId === id) setSelectedId(null);
    refresh();
  }

  return (
    <div className="grid3">
      <div className="col col-left">
        <SourceForm onCreated={handleCreated} />
        <DatasetList
          items={datasets}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDelete={handleDelete}
        />
      </div>
      <div className="col col-mid">
        <DatasetPreview datasetId={selectedId} />
      </div>
      <div className="col col-right">
        {selectedId && <ProcessPanel datasetId={selectedId} />}
      </div>
    </div>
  );
}
