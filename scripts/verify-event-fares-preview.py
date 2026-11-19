from urllib.request import Request, urlopen
from urllib.error import HTTPError
import json, time
api = 'https://matni-event-fares-review.cgr28.workers.dev'
origin = 'https://event-fares-review.my-airport-taxi-ni-preview.pages.dev'
def call(path, data=None):
    headers = {'User-Agent':'Mozilla/5.0', 'Origin':origin, 'Accept':'application/json'}
    payload = None if data is None else json.dumps(data).encode()
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    req = Request(api + path, headers=headers, data=payload)
    try:
        with urlopen(req, timeout=24) as response:
            raw = response.read(); allowed = response.headers.get('Access-Control-Allow-Origin')
            if allowed != origin: raise ValueError(f'wrong CORS for {path}: {allowed}')
            return response.status,json.loads(raw)
    except HTTPError as e:
        return e.code, e.read(420).decode(errors='replace')
status,settings = call('/pricing/public')
assert status == 200,(status,settings)
rules = settings['config']['eventVenuePickups']
aviva = next(r for r in rules if r['name'].startswith('Ireland v England'))
date = aviva['start'][:10]
avivaPlace='Aviva Stadium, Lansdowne Rd, Dublin 4, D04 K5F9, Ireland'
hotel='The Shelbourne, St Stephen’s Green, Dublin 2, Ireland'
belfast='Europa Hotel, Great Victoria Street, Belfast BT2 7AP, UK'
placeIds={avivaPlace:'ChIJ-YrraMIOZ0gRaCYDco6ZfuM',hotel:'ChIJwamzCpkOZ0gR5Dk8ikLiX1I',belfast:'ChIJzRiq-vcIYUgRkwZxoXTpPJ0'}
def quote(pickup, dropoff, when, isReturn=False):
    body = {'pickupPlaceId':placeIds[pickup], 'dropoffPlaceId':placeIds[dropoff], 'pickupAddress':pickup, 'dropoffAddress':dropoff, 'vehicleChoice':'Saloon',
            'passengers':4,'suitcases':0,'returnJourney':isReturn,'outboundDate':when,'outboundTime':'13:00',
            'routeMetrics':{'distanceKm':166,'durationMinutes':126}, 'quoteProtocol':'optional-terminal-access-v4'}
    if isReturn: body.update(returnDate=date,returnTime='20:30')
    for attempt in range(4):
        status,data=call('/quote/calculate',body)
        if status != 422 or 'routing_unavailable' not in str(data): break
        if attempt < 3: time.sleep(2 ** attempt)

    assert status==200 and data.get('ok'),(status,data)
    return data
print('Catalog', len(rules),aviva['name'],date,flush=True)
for name,pick,drop,tripDate,rt,extra in [
    ('venue pickup',avivaPlace,belfast,date,False,True),
    ('hotel pickup',hotel,belfast,date,False,False),
    ('venue dropoff',belfast,avivaPlace,date,False,False),
    ('return venue collection',belfast,avivaPlace,date,True,True),
    ('ordinary day',avivaPlace,belfast,'2027-02-08',False,False)]:
    result=quote(pick,drop,tripDate,rt)
    label=result.get('nightWeekendSurchargeLabel') or ''
    print(name,result['amount'],label,flush=True)
    assert ('venue pickup 25% surcharge' in label)==extra,(name,label,result['amount'])
print('Preview pickup, drop-off, hotel, return and ordinary-date checks passed.')
