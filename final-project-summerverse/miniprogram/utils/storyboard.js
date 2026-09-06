function coverFor(memory, fallbackCover) {
  const media = Array.isArray(memory && memory.media) ? memory.media : [];
  const cover = media.find((item) => item && item.type === 'image');
  return (cover && (cover.url || cover.fileID)) || fallbackCover;
}

function enrichStoryboard(raw = {}, memories = [], fallbackCover = '/images/feature-director-v2.jpg') {
  const memoryById = new Map(memories.map((memory) => [memory._id || memory.id, memory]));
  const rawChapters = Array.isArray(raw.chapters) ? raw.chapters.slice(0, 10) : [];
  const chapters = rawChapters.reduce((result, chapter) => {
    const ids = Array.isArray(chapter && chapter.memoryIds) ? chapter.memoryIds : [];
    const memory = ids.map((id) => memoryById.get(id)).find(Boolean);
    if (!memory) return result;
    result.push({
      ...chapter,
      memoryIds: [memory._id || memory.id],
      memory,
      cover: coverFor(memory, fallbackCover),
      index: result.length + 1
    });
    return result;
  }, []);

  if (!chapters.length) throw new Error('AI 返回的章节没有绑定到现有真实记忆，请重新生成');
  const discardedChapterCount = rawChapters.length - chapters.length;
  return {
    ...raw,
    chapters,
    discardedChapterCount,
    validationNote: discardedChapterCount > 0
      ? `已忽略 ${discardedChapterCount} 个无法对应真实记忆的 AI 章节。`
      : ''
  };
}

module.exports = { coverFor, enrichStoryboard };
