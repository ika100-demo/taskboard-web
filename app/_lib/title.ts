export const TITLE_REQUIRED = "Enter a title.";
export const TITLE_TOO_LONG = "The title can have at most 200 characters.";

export function titleError(title: string): string | null {
  if (title.trim() === "") return TITLE_REQUIRED;
  if ([...title].length > 200) return TITLE_TOO_LONG;
  return null;
}
