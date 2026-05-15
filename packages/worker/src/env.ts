export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  ENVIRONMENT?: string;
};

export type AppBindings = {
  Bindings: Env;
  Variables: {
    auth?: {
      user_id: number;
      role: "admin" | "ft" | "team";
      round_id?: number;
    };
  };
};
