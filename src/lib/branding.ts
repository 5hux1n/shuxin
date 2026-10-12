export function browserBrandTitle(title: string, subtitle: string, logo: string, nickname: string, bio: string) {
  const join = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))].join(" · ");
  return join([logo, title, subtitle]) || join([nickname, bio]) || "ShuXin";
}
