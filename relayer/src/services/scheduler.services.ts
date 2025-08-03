import { AuctionService } from "./auction.services";

const auctionService = new AuctionService();
const timers = new Map<string, NodeJS.Timeout>();

class SchedulerService {
  schedule(
    orderId: string,
    start: Date,
    duration: number,
    points: { price: number; weight: number }[]
  ) {
    const delay = start.getTime() + duration * 1000 - Date.now();

    if (delay <= 0) {
      // Already past the end — close immediately
      auctionService.closeAuction(
        orderId.toString(),
        Math.floor(start.getTime() / 1000),
        duration,
        points
      );
      return;
    }

    // Clear existing timer
    if (timers.has(orderId)) {
      clearTimeout(timers.get(orderId)!);
    }

    const timer = setTimeout(() => {
      auctionService
        .closeAuction(
          orderId.toString(),
          Math.floor(start.getTime() / 1000),
          duration,
          points
        )
        .catch((err: any) =>
          console.error(`Failed to close auction for order ${orderId}:`, err)
        );
      timers.delete(orderId);
    }, delay);

    timers.set(orderId, timer);
  }

  cancel(orderId: string) {
    if (timers.has(orderId)) {
      clearTimeout(timers.get(orderId)!);
      timers.delete(orderId);
    }
  }
}

export const scheduler = new SchedulerService();
