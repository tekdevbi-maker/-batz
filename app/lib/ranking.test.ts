import { computeStandardCompetitionRanks } from "./ranking";

const identity = (n: number) => n;

test("no ties -- sequential ranks", () => {
  expect(computeStandardCompetitionRanks([10, 8, 5, 2], identity)).toEqual([1, 2, 3, 4]);
});

test("a two-way tie skips the next rank by one", () => {
  // Matches the user's example: two players tied for 5th, next is 7th.
  const values = [10, 9, 8, 7, 6, 6, 4];
  expect(computeStandardCompetitionRanks(values, identity)).toEqual([1, 2, 3, 4, 5, 5, 7]);
});

test("a three-way tie skips the next rank by two", () => {
  const values = [10, 8, 8, 8, 5, 5, 2];
  expect(computeStandardCompetitionRanks(values, identity)).toEqual([1, 2, 2, 2, 5, 5, 7]);
});

test("all tied -- everyone shares rank 1", () => {
  expect(computeStandardCompetitionRanks([3, 3, 3], identity)).toEqual([1, 1, 1]);
});

test("empty list", () => {
  expect(computeStandardCompetitionRanks([], identity)).toEqual([]);
});
