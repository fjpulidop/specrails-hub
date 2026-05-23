declare module '*?worker' {
  const WorkerCtor: { new (): Worker }
  export default WorkerCtor
}
