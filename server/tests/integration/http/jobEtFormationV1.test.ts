import assert from "assert"

import { describe, expect, it } from "vitest"

import { useMongo } from "@tests/utils/mongo.utils"
import { useServer } from "@tests/utils/server.utils"

describe("jobEtFormationV1", () => {
  useMongo()
  const httpClient = useServer()
  it("Vérifie que la route répond", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations" })

    expect(response.statusCode).toBe(400)
  })

  /*it("Vérifie que la recherche répond", async () => {
    ;

    const response = await httpClient().get(
      "/api/V1/jobsEtFormations?romes=F1603,I1308&longitude=2.3752&latitude=48.845&radius=30&insee=75056&caller=a"
    );

    expect(response.statusCode).toBe(200);
  });*/

  /*it("Vérifie que la recherche répond avec des résultats", async () => {
    console.log("entering...");

    ;

    const response = await httpClient().get(
      "/api/V1/jobsEtFormations?romes=F1603,I1308&longitude=2.3752&latitude=48.845&radius=30&insee=75056&caller=a"
    );

    expect(response.statusCode).toBe(200);
    assert.ok(JSON.parse(response.body).formations.results instanceof );
    assert.ok(JSON.parse(response.body).jobs.matchas.results instanceof );
    assert.strictEqual(JSON.parse(response.body).jobs.peJobs.status, 401);
    assert.strictEqual(JSON.parse(response.body).jobs.lbaCompanies.status, 401);
  });*/

  /*it("Vérifie que la recherche répond avec des résultats", async () => {
    ;

    const response = await httpClient().get(
      "/api/V1/jobsEtFormations?romes=F1603,I1308&longitude=2.3752&latitude=48.845&radius=30&insee=75056&sources=lba&caller=a"
    );

    expect(response.statusCode).toBe(200);
    assert.ok(JSON.parse(response.body).formations === null);
    assert.ok(JSON.parse(response.body).jobs.peJobs === null);
    //assert.ok(JSON.parse(response.body).jobs.lbaCompanies.results instanceof );
    assert.strictEqual(JSON.parse(response.body).jobs.lbaCompanies.status, 401);
    assert.ok(JSON.parse(response.body).jobs.lbbCompanies === null);
  });*/

  it.skip("Vérifie que les requêtes sans ROME sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=&longitude=2.3752&latitude=48.845&radius=30&insee=75056" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(JSON.parse(response.body).error_messages.indexOf("romes : Rome codes are missing. At least 1.") >= 0)
  })

  it("Vérifie que les requêtes avec ROME mal formé sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=ABCDE&longitude=2.3752&latitude=48.845&radius=30&insee=75056" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(JSON.parse(response.body).error_messages.indexOf("romes : Badly formatted rome codes. Rome code must be one letter followed by 4 digit number. ex : A1234") >= 0)
  })

  it.skip("Vérifie que les requêtes avec trop de ROME sont refusées", async () => {
    const response = await httpClient().inject({
      method: "GET",
      path: "/api/V1/jobsEtFormations?romes=ABCDE,ABCDE,ABCDE,ABCDE,ABCDE,ABCDE,ABCDE,ABCDE,ABCDE,ABCDE,ABCDE,ABCDE,ABCDE,ABCDE,ABCDE,ABCDE&longitude=2.3752&latitude=48.845&radius=30&insee=75056",
    })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(JSON.parse(response.body).error_messages.indexOf("romes : Too many rome codes. Maximum is 15.") >= 0)
  })

  it("Vérifie que les requêtes sans caller sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&longitude=2.3752&latitude=48.845&radius=30&insee=75056" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(JSON.parse(response.body).error_messages.indexOf("caller : caller is missing.") >= 0)
  })

  it("Vérifie que les requêtes sans code insee sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&longitude=2.3752&latitude=48.845&radius=30&insee=" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(JSON.parse(response.body).error_messages.indexOf("insee : insee city code is missing.") >= 0)
  })

  it("Vérifie que les requêtes avec code insee mal formé sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&longitude=2.3752&latitude=48.845&radius=30&insee=ABCDE" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(JSON.parse(response.body).error_messages.indexOf("insee : Badly formatted insee city code. Must be 5 digit number.") >= 0)
  })

  it("Vérifie que les requêtes sans radius sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&longitude=2.3752&latitude=48.845&insee=12345" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(JSON.parse(response.body).error_messages.indexOf("radius : Search radius is missing.") >= 0)
  })

  it("Vérifie que les requêtes avec radius mal formé sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&longitude=2.3752&latitude=48.845&radius=XX&insee=12345" })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      data: {
        validationError: {
          code: "FST_ERR_VALIDATION",
          issues: [
            {
              code: "invalid_type",
              expected: "number",
              message: "Number attendu",
              path: ["radius"],
              received: "nan",
            },
          ],
          name: "ZodError",
          statusCode: 400,
          validationContext: "querystring",
        },
      },
      error: "Bad Request",
      message: "querystring.radius: Number attendu",
      statusCode: 400,
    })
  })

  it("Vérifie que les requêtes avec radius hors limite sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&longitude=2.3752&latitude=48.845&radius=201&insee=12345" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(JSON.parse(response.body).error_messages.indexOf("radius : Search radius must be a number between 0 and 200.") >= 0)
  })

  it("Vérifie que les requêtes sans latitude sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&radius=0&longitude=2.3752&latitude=&insee=12345" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(JSON.parse(response.body).error_messages.indexOf("latitude : Search center latitude is missing.") >= 0)
  })

  it("Vérifie que les requêtes avec latitude mal formée sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&radius=0&longitude=2.3752&latitude=AX&insee=12345" })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      data: {
        validationError: {
          code: "FST_ERR_VALIDATION",
          issues: [
            {
              code: "invalid_type",
              expected: "number",
              message: "Number attendu",
              path: ["latitude"],
              received: "nan",
            },
          ],
          name: "ZodError",
          statusCode: 400,
          validationContext: "querystring",
        },
      },
      error: "Bad Request",
      message: "querystring.latitude: Number attendu",
      statusCode: 400,
    })
  })

  it("Vérifie que les requêtes avec latitude hors limites sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&radius=0&longitude=2.3752&latitude=91&insee=12345" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(JSON.parse(response.body).error_messages.indexOf("latitude : Search center latitude must be a number between -90 and 90.") >= 0)
  })

  it("Vérifie que les requêtes sans longitude sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&radius=0&longitude=&latitude=2.3752&insee=12345" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(JSON.parse(response.body).error_messages.indexOf("longitude : Search center longitude is missing.") >= 0)
  })

  it("Vérifie que les requêtes avec longitude mal formée sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&radius=0&longitude=AX&latitude=2.3752&insee=12345" })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      data: {
        validationError: {
          code: "FST_ERR_VALIDATION",
          issues: [
            {
              code: "invalid_type",
              expected: "number",
              message: "Number attendu",
              path: ["longitude"],
              received: "nan",
            },
          ],
          name: "ZodError",
          statusCode: 400,
          validationContext: "querystring",
        },
      },
      error: "Bad Request",
      message: "querystring.longitude: Number attendu",
      statusCode: 400,
    })
  })

  it("Vérifie que les requêtes avec longitude hors limites sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&radius=0&longitude=181&latitude=90&insee=12345" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(JSON.parse(response.body).error_messages.indexOf("longitude : Search center longitude must be a number between -180 and 180.") >= 0)
  })

  it("Vérifie que les requêtes avec sources mal formée sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&radius=0&longitude=180&latitude=90&insee=12345&sources=lba,lbc" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "wrong_parameters")
    assert.ok(
      JSON.parse(response.body).error_messages.indexOf(
        "sources : Optional sources argument used with wrong value. Should contains comma separated values among 'formations', 'lbb', 'lba', 'offres', 'matcha'."
      ) >= 0
    )
  })

  it("Vérifie que les requêtes avec diploma mal formée sont refusées", async () => {
    const response = await httpClient().inject({ method: "GET", path: "/api/V1/jobsEtFormations?romes=F1603,I1308&radius=0&longitude=180&latitude=90&diploma=lba,lbc" })

    expect(response.statusCode).toBe(400)
    assert.deepStrictEqual(JSON.parse(response.body).error, "Bad Request")
    assert.ok(JSON.parse(response.body).message.indexOf("querystring.diploma: Invalid enum value") >= 0)
  })
})
