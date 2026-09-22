const technologies = [
  ['React', 'react'],
  ['TypeScript & TSX', 'typescript'],
  ['Vite', 'vite'],
  ['Microsoft Fluent UI', 'fluentui'],
  ['Vercel', 'vercel'],
  ['Railway', 'railway'],
  ['Docker', 'docker'],
  ['HiveMQ', 'hivemq'],
  ['MQTT', 'mqtt'],
  ['FreeRTOS', 'freertos'],
  ['ESP32', 'espressif'],
  ['PostgreSQL', 'postgresql'],
  ['Zod', 'zod'],
  ['WebSocket', 'websocket'],
] as const;

export function LoginCredits() {
  return <>
    <section className="login-technologies" aria-labelledby="login-technologies-heading">
      <h2 id="login-technologies-heading">Built with</h2>
      <ul>{technologies.map(([name, icon]) => <li key={icon}>
        <img src={`/technology-icons/${icon}.svg`} alt="" width={22} height={24}
          className={icon === 'vercel' || icon === 'railway' ? 'technology-monochrome' : undefined} />
        <span>{name}</span>
      </li>)}</ul>
    </section>
    <p className="login-credit">Web app carefully crafted by Mattias Li.</p>
  </>;
}
