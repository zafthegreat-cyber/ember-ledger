import { Response, Router } from "express";

type CrudService<T> = {
  list: (query?: string) => T[];
  get?: (id: string) => T | null;
  create: (input: Partial<T>) => T;
  update: (id: string, input: Partial<T>) => T | null;
  remove: (id: string) => T | null;
};

export function jsonError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: true, message });
}

export function createCrudRouter<T>(service: CrudService<T>, notFoundMessage: string) {
  const router = Router();

  router.get("/", (req, res) => {
    res.json(service.list(String(req.query.q || "")));
  });

  router.post("/", (req, res) => {
    res.status(201).json(service.create(req.body));
  });

  router.get("/:id", (req, res) => {
    const item = service.get ? service.get(req.params.id) : service.list().find((entry: any) => entry.id === req.params.id);
    if (!item) return jsonError(res, 404, notFoundMessage);
    return res.json(item);
  });

  router.put("/:id", (req, res) => {
    const item = service.update(req.params.id, req.body);
    if (!item) return jsonError(res, 404, notFoundMessage);
    return res.json(item);
  });

  router.delete("/:id", (req, res) => {
    const item = service.remove(req.params.id);
    if (!item) return jsonError(res, 404, notFoundMessage);
    return res.json(item);
  });

  return router;
}

