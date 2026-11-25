import { Container } from "@cloudflare/containers";

/** Native sharp/ffmpeg/PDF processing, private to this Worker's container binding. */
export class MediaContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "30s";
}
