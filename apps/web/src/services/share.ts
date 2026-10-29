export async function shareResult(score: number): Promise<string> {
  const text = `Я собрал ${score} кассет в игре к 10-летию альбома «Развлечение». А сколько соберёшь ты?`;
  const url = import.meta.env.VITE_MINI_APP_URL as string | undefined;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Развлечение', text, ...(url ? { url } : {}) });
      return 'Результат готов к отправке';
    }
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return 'Результат скопирован';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return '';
    return 'Не удалось скопировать. Ваш результат: ' + score + ' кассет.';
  }
}
