const HEADLINE = "Every job, from order to closed.";
const WORD_STAGGER_MS = 110;

export function LoginHero() {
  const words = HEADLINE.split(" ");

  return (
    <section
      aria-labelledby="login-headline"
      className="login-hero flex flex-col justify-between gap-10 p-8 md:p-12"
    >
      <p className="flex items-center gap-2 font-bold">
        <span aria-hidden="true" className="inline-block size-6 rounded-lg bg-primary" />
        Sejuk Sejuk Ops
      </p>

      <div>
        <h1 id="login-headline" className="max-w-[12ch] text-5xl leading-none md:text-6xl">
          {words.map((word, index) => (
            <span
              key={`${word}-${index}`}
              className="inline-block animate-word-fade"
              style={{ animationDelay: `${index * WORD_STAGGER_MS}ms` }}
            >
              {word}
              {index < words.length - 1 && " "}
            </span>
          ))}
        </h1>
        <p className="mt-4 max-w-[40ch] text-muted-foreground">
          Orders, assignments, completions and reviews for every technician, in one place.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">v1.0 · demo environment</p>
    </section>
  );
}
