#!/bin/bash
# Copyright 2017 Google Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Downloads stories based on URLs in a CSV file into the corpus/ directory.
#
# Usage: download_stories.sh <csv_file> <num_rows>
#   csv_file  Name of the CSV file.
#   num_rows  Number of rows to use with tail -n.

base=$(dirname "$0")

if [ $# -ne 2 ]; then
  echo "Usage: $0 <csv_file> <num_rows>" >&2
  exit 1
fi

csv_file="$1"
num_rows="$2"

# Strip the .csv extension to build the id_url file name
csv_stem="${csv_file%.csv}"
id_url_file="${base}/${csv_stem}_id_url.csv"

mkdir -p ${base}/corpus
cat ${base}/${csv_file} | cut -d',' -f 1,3,4,5 | tail -n ${num_rows} > ${id_url_file}

IFS=","
count=0
while read id kind url fs; do
  count=$((count + 1))
  echo "Downloading file ${count}: ${id}"
  file="${base}/corpus/${id}.txt"
  if [ ! -f $file ]; then
    size="0"
  else
    size=$(wc -c <"$file")
  fi

  # The following attempts a re-download if the file doesn't exit or is too
  # small.
  if [ ! -f $file -o $size -le 19000 ]; then
    rm -f "$file"
    if [ $kind == "gutenberg" ]; then
      sleep 2
    fi
    wget -nc -q -O $file "$url"
  fi
  # Some Gutenberg files are downloaded as gzipped text.
  type="$(file -b $file)"
  if [[ $type == *"gzip compressed"* ]]; then
    echo "compressed"
    mv $file "${file}.gz"
    gunzip "${file}.gz"
  fi
done < ${id_url_file}
