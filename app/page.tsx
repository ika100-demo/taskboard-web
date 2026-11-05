import { TaskBoard } from "./_components/task-board";
import { listTasks } from "./_lib/task-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await listTasks();
  return (
    <>
      <h1>Taskboard</h1>
      <TaskBoard initialTasks={result.ok ? result.tasks : null} />
    </>
  );
}
