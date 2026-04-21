import { ElasticService } from "./services/elastic.js";

let _elastic: ElasticService | undefined;

export function getElastic(): ElasticService {
  _elastic ??= new ElasticService();
  return _elastic;
}
