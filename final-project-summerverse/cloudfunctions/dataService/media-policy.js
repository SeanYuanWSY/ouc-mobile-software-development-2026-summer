function uniqueCloudFileIDs(values = []) {
  return [...new Set(values.filter((value) => String(value || '').startsWith('cloud://')))];
}

function registeredFileIDs(requested = [], records = []) {
  const registered = new Set(records.map((item) => item && item.fileID).filter(Boolean));
  return requested.filter((fileID) => registered.has(fileID));
}

function deletionOutcome(requested = [], response = {}) {
  const completedCodes = new Set(['SUCCESS', 'STORAGE_FILE_NONEXIST']);
  const deletedSet = new Set((response.fileList || [])
    .filter((item) => item && (item.status === 0 || completedCodes.has(item.code)))
    .map((item) => item.fileID));
  return {
    deleted: requested.filter((fileID) => deletedSet.has(fileID)),
    failed: requested.filter((fileID) => !deletedSet.has(fileID))
  };
}

module.exports = { uniqueCloudFileIDs, registeredFileIDs, deletionOutcome };
